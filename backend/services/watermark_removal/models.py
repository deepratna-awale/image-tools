"""The watermark finder (Florence-2) and the inpainting models (FLUX.1 Fill or SDXL
Inpainting). Imports torch, so only the GPU endpoint and the worker load this module."""

import logging
import threading
from typing import List, Tuple

import numpy as np
import torch
from PIL import Image

from config.settings import settings

logger = logging.getLogger(__name__)

Box = Tuple[float, float, float, float]

# What the finder is asked to locate, in order: the first phrase that finds anything wins
DETECT_PHRASES = ("watermark", "logo watermark", "text watermark")
# A box covering more of the image than this is the finder calling the whole photo a
# watermark (it does that with tiled ones), so text boxes are used instead
MAX_BOX_SHARE = 0.5

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
        """Corner points (clockwise from top left, in image pixels) of each watermark"""
        image = image.convert("RGB")
        area = image.width * image.height
        for phrase in DETECT_PHRASES:
            found = self._run(image, "<OPEN_VOCABULARY_DETECTION>", phrase)
            boxes = [box for box in found.get("bboxes", []) if _box_area(box) <= MAX_BOX_SHARE * area]
            if boxes:
                logger.info(f"Found {len(boxes)} watermark(s) as '{phrase}'")
                return [_corners(box) for box in boxes]
            if found.get("bboxes"):
                # Covers the whole photo: most likely a tiled watermark made of text
                text = self._run(image, "<OCR_WITH_REGION>")
                quads = [np.array(q, dtype=float).reshape(4, 2).tolist() for q in text.get("quad_boxes", [])]
                logger.info(f"Watermark covers the photo; using {len(quads)} text regions")
                return quads
        return []


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


class FluxFiller(Filler):
    """FLUX.1 Fill [dev], its 12B transformer quantized to 4 bits to fit a 24 GB GPU"""

    multiple = 16

    def __init__(self, path: str):
        from diffusers import BitsAndBytesConfig, FluxFillPipeline, FluxTransformer2DModel

        transformer = FluxTransformer2DModel.from_pretrained(
            path,
            subfolder="transformer",
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16
            ),
            torch_dtype=torch.bfloat16,
        )
        self.pipe = FluxFillPipeline.from_pretrained(path, transformer=transformer, torch_dtype=torch.bfloat16)
        self.pipe.to("cuda")

    @torch.inference_mode()
    def fill(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        return self.pipe(
            prompt=FILL_PROMPT,
            image=image,
            mask_image=mask,
            width=image.width,
            height=image.height,
            num_inference_steps=settings.watermark_steps,
            guidance_scale=30,
            generator=torch.Generator("cuda").manual_seed(0),
        ).images[0]


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


def get_filler() -> Filler:
    """Load the configured inpainting model once per process"""
    with _lock:
        if "filler" not in _models:
            name = settings.watermark_fill_model
            logger.info(f"Loading the {name} inpainting model")
            if name == "sdxl":
                _models["filler"] = SdxlFiller(settings.watermark_sdxl_path)
            else:
                _models["filler"] = FluxFiller(settings.watermark_flux_path)
        return _models["filler"]
