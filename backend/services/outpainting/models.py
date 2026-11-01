"""The model that paints the new area (FLUX.1 Kontext [dev], shared with the watermark
remover) and the upscaler that brings it to full size. Imports torch, so only the GPU
endpoint and the worker load this module."""

import logging
import threading

import numpy as np
import torch
from PIL import Image

from config.settings import settings

logger = logging.getLogger(__name__)

# What Kontext is asked to do; a description from the user is added to it
PROMPT = (
    "Zoom out to show more of the scene around this picture, continuing the same "
    "subjects, background, perspective, lighting, colours and style seamlessly to the "
    "new edges. No frame, border, text or watermark."
)
# Used when Kontext is shown the canvas with the new area left plain white
# (reference="padded"), so the picture stays where it is instead of being redrawn smaller
PADDED_PROMPT = (
    "Fill the plain white area around this picture with a seamless continuation of the "
    "scene, matching its perspective, lighting, colours, detail and style. Keep the picture "
    "itself unchanged. No white area, frame, border, text or watermark."
)


def on_gpu() -> bool:
    return torch.cuda.is_available()


def build_prompt(prompt: str = "", base: str = PROMPT) -> str:
    return f"{base} In the new area: {prompt}" if prompt else base


class Painter:
    """FLUX.1 Kontext's inpainting pipeline, built on the watermark remover's loaded
    Kontext model so the 12B transformer and T5 are in GPU memory only once"""

    def __init__(self):
        from diffusers import FluxKontextInpaintPipeline

        from services.watermark_removal.models import get_kontext

        # Built straight from the loaded components: from_pipe would also cast every
        # module it can to float32, doubling the text encoders in GPU memory. The scheduler
        # keeps per-run state, so this pipeline gets its own.
        components = dict(get_kontext().pipe.components)
        components["scheduler"] = components["scheduler"].__class__.from_config(components["scheduler"].config)
        self.pipe = FluxKontextInpaintPipeline(**components)

    @torch.inference_mode()
    def paint(
        self,
        photo: Image.Image,
        canvas: Image.Image,
        mask: Image.Image,
        prompt: str = "",
        reference: str = "photo",
        base_prompt: str = "",
        steps: int = 0,
        guidance: float = 2.5,
        seed: int = 0,
    ) -> Image.Image:
        """Repaint what's white in `mask` on `canvas` (the photo placed on the work
        canvas, its edges stretched outwards). Kontext is shown either the photo alone
        (`reference="photo"`, so it 'zooms out' from a clean picture) or the canvas with
        the area to paint left white (`reference="padded"`)."""
        width, height = canvas.size
        if reference == "photo":
            # At about the work area too: the reference adds as many tokens as its pixels
            factor = min(1.0, (width * height / (photo.width * photo.height)) ** 0.5)
            size = [max(16, round(side * factor / 16) * 16) for side in photo.size]
            photo = photo.resize(size, Image.LANCZOS)
        elif reference == "padded":
            padded = np.array(canvas.convert("RGB"))
            padded[np.asarray(mask) > 127] = 255
            photo = Image.fromarray(padded)
        else:
            raise ValueError(f"Unknown reference {reference!r}")
        return self.pipe(
            image=canvas,
            image_reference=photo,
            mask_image=mask,
            prompt=build_prompt(prompt, base_prompt or (PROMPT if reference == "photo" else PADDED_PROMPT)),
            width=width,
            height=height,
            strength=1.0,
            num_inference_steps=steps or settings.outpaint_steps,
            guidance_scale=guidance,
            max_area=width * height,
            generator=torch.Generator("cuda").manual_seed(seed),
            _auto_resize=False,
        ).images[0]


_lock = threading.Lock()
_models: dict = {}


def get_painter() -> Painter:
    with _lock:
        if "painter" not in _models:
            logger.info("Loading the outpainting model")
            _models["painter"] = Painter()
        return _models["painter"]


def enlarge(rgb: np.ndarray) -> np.ndarray:
    """4x with Real-ESRGAN, the anime/art or photo model as the upscaler would pick"""
    from services.upscaling.models import get_model
    from services.upscaling.processor import ANIME_THRESHOLD

    style = "anime" if get_model("style").anime_probability(rgb) > ANIME_THRESHOLD else "photo"
    return get_model(style).upscale(rgb)
