"""The watermark finder (Florence-2) and the models that repaint it (FLUX.1 Kontext or
SDXL Inpainting). Imports torch, so only the GPU endpoint and the worker load this module."""

import logging
import threading
from typing import List, Tuple

import numpy as np
import torch
from PIL import Image

from config.settings import settings

logger = logging.getLogger(__name__)

Box = Tuple[float, float, float, float]

# What the finder is asked to locate; every phrase is tried and all boxes are kept,
# as each one catches watermarks the others miss (a corner credit vs a big faint label)
DETECT_PHRASES = ("watermark", "logo watermark", "text watermark")
# A box covering more of the image than this is the finder calling the whole photo a
# watermark (it does that with tiled ones), so it is dropped and text boxes do the work
MAX_BOX_SHARE = 0.5
# Text lines shorter than this share of the image height are left alone: watermarks are
# made to be seen, small text is usually part of the photo (signs, labels)
MIN_TEXT_SHARE = 0.02

# What Kontext is asked to do
EDIT_PROMPT = (
    "Remove all watermark text, logos and overlaid captions from the photo. "
    "Keep everything else exactly the same."
)
# What the inpainting model is steered towards and away from
FILL_PROMPT = "clean photo, seamless natural background, high quality"
NEGATIVE_PROMPT = "text, watermark, logo, letters, signature, caption, stamp, blurry, artifacts"


def on_gpu() -> bool:
    return torch.cuda.is_available()


class WatermarkFinder:
    """Florence-2: finds watermarks (text or logos) as boxes"""

    def __init__(self, path: str):
        from transformers import AutoProcessor, Florence2ForConditionalGeneration

        self.processor = AutoProcessor.from_pretrained(path)
        self.model = Florence2ForConditionalGeneration.from_pretrained(path, torch_dtype=torch.float16).to("cuda").eval()

    @torch.inference_mode()
    def _run(self, image: Image.Image, task: str, text: str = "") -> dict:
        inputs = self.processor(text=task + text, images=image, return_tensors="pt").to("cuda", torch.float16)
        ids = self.model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=1024,
            num_beams=3,
            do_sample=False,
        )
        generated = self.processor.batch_decode(ids, skip_special_tokens=False)[0]
        return self.processor.post_process_generation(generated, task=task, image_size=image.size)[task]

    def find(self, image: Image.Image) -> List[List[List[float]]]:
        """Corner points (clockwise from top left, in image pixels) of each watermark:
        what Florence-2 calls a watermark plus any sizeable text overlaid on the photo"""
        image = image.convert("RGB")
        area = image.width * image.height
        found = []
        for phrase in DETECT_PHRASES:
            boxes = self._run(image, "<OPEN_VOCABULARY_DETECTION>", phrase).get("bboxes", [])
            found += [_corners(box) for box in boxes if _box_area(box) <= MAX_BOX_SHARE * area]
        text = self._run(image, "<OCR_WITH_REGION>").get("quad_boxes", [])
        quads = [np.array(quad, dtype=float).reshape(4, 2) for quad in text]
        found += [quad.tolist() for quad in quads if np.ptp(quad[:, 1]) >= MIN_TEXT_SHARE * image.height]
        logger.info(f"Found {len(found)} watermark region(s)")
        return found


def _box_area(box) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def _corners(box) -> List[List[float]]:
    x1, y1, x2, y2 = box
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


class Filler:
    """A diffusion inpainting model: repaints the masked part of an image"""

    # Sides must be multiples of this
    multiple = 8

    def fill(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        raise NotImplementedError


class KontextFiller(Filler):
    """FLUX.1 Kontext [dev], an instruction editor, its 12B transformer quantized to 4 bits
    and its T5 text encoder to 8 bits (about 12 GB in all) to fit a 24 GB GPU next to the
    other tools' models. Unlike an inpainting model it sees the watermark it is removing,
    so it rebuilds what was under it instead of inventing something new for the hole."""

    multiple = 16

    def __init__(self, path: str):
        from diffusers import BitsAndBytesConfig, FluxKontextPipeline, FluxTransformer2DModel
        from transformers import BitsAndBytesConfig as TextBitsAndBytesConfig, T5EncoderModel

        # Whatever the other tools left in PyTorch's cache goes back first
        torch.cuda.empty_cache()
        text_encoder_2 = T5EncoderModel.from_pretrained(
            path,
            subfolder="text_encoder_2",
            quantization_config=TextBitsAndBytesConfig(load_in_8bit=True),
            torch_dtype=torch.bfloat16,
        )
        transformer = FluxTransformer2DModel.from_pretrained(
            path,
            subfolder="transformer",
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16
            ),
            torch_dtype=torch.bfloat16,
        )
        self.pipe = FluxKontextPipeline.from_pretrained(
            path, transformer=transformer, text_encoder_2=text_encoder_2, torch_dtype=torch.bfloat16
        )
        self.pipe.to("cuda")
        # The VAE and CLIP encoder have been seen to come up in float32 next to the
        # quantized parts, which breaks on bfloat16 inputs; pin them to bfloat16
        for module in (self.pipe.vae, self.pipe.text_encoder):
            module.to(dtype=torch.bfloat16)
        logger.info(
            "Kontext component dtypes: "
            + ", ".join(f"{name}={module.dtype}" for name, module in self.pipe.components.items() if hasattr(module, "dtype"))
        )

    @torch.inference_mode()
    def fill(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        # The whole crop is edited at the trained size nearest its shape; the caller
        # pastes back only the masked pixels
        from diffusers.pipelines.flux.pipeline_flux_kontext import PREFERRED_KONTEXT_RESOLUTIONS

        ratio = image.width / image.height
        width, height = min(PREFERRED_KONTEXT_RESOLUTIONS, key=lambda size: abs(ratio - size[0] / size[1]))
        edited = self.pipe(
            image=image.resize((width, height), Image.LANCZOS),
            prompt=EDIT_PROMPT,
            width=width,
            height=height,
            num_inference_steps=settings.watermark_steps,
            guidance_scale=2.5,
            generator=torch.Generator("cuda").manual_seed(0),
            _auto_resize=False,
        ).images[0]
        return align(edited.resize(image.size, Image.LANCZOS), image, mask)


def align(edited: Image.Image, original: Image.Image, mask: Image.Image) -> Image.Image:
    """Kontext can shift or zoom the picture a little; warp its edit back onto the
    original, matching on the pixels outside the mask, so the pasted area lines up"""
    import cv2

    target = np.asarray(original.convert("L"), dtype=np.float32)
    moved = np.asarray(edited.convert("L"), dtype=np.float32)
    outside = (np.asarray(mask) == 0).astype(np.uint8)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5)
        _, warp = cv2.findTransformECC(target, moved, warp, cv2.MOTION_AFFINE, criteria, outside, 5)
    except cv2.error:
        logger.warning("Could not line the edit up with the original; using it as it is")
        return edited
    pixels = cv2.warpAffine(
        np.asarray(edited.convert("RGB")),
        warp,
        original.size,
        flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return Image.fromarray(pixels)


class SdxlFiller(Filler):
    """SDXL Inpainting 0.1 in half precision (with the fp16-safe SDXL VAE)"""

    def __init__(self, path: str):
        from diffusers import AutoencoderKL, StableDiffusionXLInpaintPipeline

        vae = AutoencoderKL.from_pretrained(f"{path}/vae-fp16-fix", torch_dtype=torch.float16)
        self.pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
            path, vae=vae, torch_dtype=torch.float16, variant="fp16"
        ).to("cuda")

    @torch.inference_mode()
    def fill(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        return self.pipe(
            prompt=FILL_PROMPT,
            negative_prompt=NEGATIVE_PROMPT,
            image=image,
            mask_image=mask,
            width=image.width,
            height=image.height,
            strength=0.99,
            num_inference_steps=settings.watermark_steps,
            guidance_scale=7.0,
            generator=torch.Generator("cuda").manual_seed(0),
        ).images[0]


_lock = threading.Lock()
_models: dict = {}


def get_finder() -> WatermarkFinder:
    with _lock:
        if "finder" not in _models:
            logger.info("Loading the watermark finder")
            _models["finder"] = WatermarkFinder(settings.watermark_detector_path)
        return _models["finder"]


def get_kontext() -> KontextFiller:
    """FLUX.1 Kontext, loaded once per process (outpainting builds on it too)"""
    with _lock:
        if "kontext" not in _models:
            logger.info("Loading FLUX.1 Kontext")
            _models["kontext"] = KontextFiller(settings.watermark_flux_path)
        return _models["kontext"]


def get_filler() -> Filler:
    """Load the configured inpainting model once per process"""
    if settings.watermark_fill_model != "sdxl":
        return get_kontext()
    with _lock:
        if "filler" not in _models:
            logger.info("Loading the sdxl inpainting model")
            _models["filler"] = SdxlFiller(settings.watermark_sdxl_path)
        return _models["filler"]
