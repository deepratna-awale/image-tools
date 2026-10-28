import asyncio
import io
import logging
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

from config.settings import settings

logger = logging.getLogger(__name__)

STYLES = ("auto", "photo", "anime")
DEFAULT_SCALE = 2.0
MAX_SCALE = 4.0
# The style check calls an image anime/art above this probability
ANIME_THRESHOLD = 0.5


def plan_size(
    width: int,
    height: int,
    scale: Optional[float] = None,
    target_width: Optional[int] = None,
    target_height: Optional[int] = None,
) -> Tuple[int, int, int, int]:
    """Work out the upscaled size and the final (cropped) size of a width x height image.

    With a target width and height the image is scaled until it covers both, then the
    overflow is cropped from the centre; with one of them the other follows the aspect
    ratio; otherwise it is scaled by `scale`. Returns (scaled_w, scaled_h, final_w, final_h).
    """
    if target_width or target_height:
        factor = max((target_width or 0) / width, (target_height or 0) / height)
        scaled_w = max(target_width or 0, round(width * factor))
        scaled_h = max(target_height or 0, round(height * factor))
        final_w, final_h = target_width or scaled_w, target_height or scaled_h
        if factor < 1:
            raise ValueError(f"The image ({width}x{height}) is already larger than {final_w}x{final_h}")
        if factor > MAX_SCALE:
            raise ValueError(
                f"{final_w}x{final_h} needs {factor:.1f}x; the most is {MAX_SCALE:g}x this image's {width}x{height}"
            )
    else:
        factor = DEFAULT_SCALE if scale is None else scale
        if not 1 <= factor <= MAX_SCALE:
            raise ValueError(f"Scale must be between 1 and {MAX_SCALE:g}")
        scaled_w, scaled_h = max(1, round(width * factor)), max(1, round(height * factor))
        final_w, final_h = scaled_w, scaled_h

    if scaled_w * scaled_h > settings.upscale_max_output_pixels:
        megapixels = settings.upscale_max_output_pixels / 1_000_000
        raise ValueError(
            f"The result would be {scaled_w}x{scaled_h}; the most is {megapixels:.1f} megapixels. "
            "Pick a smaller scale or size."
        )
    return scaled_w, scaled_h, final_w, final_h


def _crop_centre(pixels: np.ndarray, width: int, height: int) -> np.ndarray:
    top = (pixels.shape[0] - height) // 2
    left = (pixels.shape[1] - width) // 2
    return pixels[top:top + height, left:left + width]


class UpscalingProcessor:
    """Enlarges an image with Real-ESRGAN, picking the anime or photo model by itself"""

    async def process(
        self,
        image_data: bytes,
        scale: Optional[float] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        style: str = "auto",
    ) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._upscale, image_data, scale, width, height, style
        )

    def _upscale(
        self,
        image_data: bytes,
        scale: Optional[float],
        target_width: Optional[int],
        target_height: Optional[int],
        style: str,
    ) -> bytes:
        # torch is only imported by the worker, never by the API
        from .models import get_model, on_gpu

        source = Image.open(io.BytesIO(image_data))
        icc_profile = source.info.get("icc_profile")
        image = ImageOps.exif_transpose(source)
        width, height = image.size
        scaled_w, scaled_h, final_w, final_h = plan_size(width, height, scale, target_width, target_height)
        if not on_gpu() and width * height > settings.upscale_cpu_max_input_pixels:
            raise ValueError("This image is too large to upscale right now; try one under 1 megapixel")

        alpha = None
        if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
            alpha = np.asarray(image.convert("RGBA").getchannel("A"))
        rgb = np.asarray(image.convert("RGB"))

        if style not in ("photo", "anime"):
            anime = get_model("style").anime_probability(rgb)
            style = "anime" if anime > ANIME_THRESHOLD else "photo"
            logger.info(f"Style check: {anime:.2f} anime, using the {style} model")

        upscaled = get_model(style).upscale(rgb)
        result = cv2.resize(upscaled, (scaled_w, scaled_h), interpolation=cv2.INTER_AREA)
        result = _crop_centre(result, final_w, final_h)
        output = Image.fromarray(result)
        if alpha is not None:
            alpha = cv2.resize(alpha, (scaled_w, scaled_h), interpolation=cv2.INTER_CUBIC)
            output.putalpha(Image.fromarray(_crop_centre(alpha, final_w, final_h)))

        buffer = io.BytesIO()
        output.save(buffer, format="PNG", icc_profile=icc_profile)
        return buffer.getvalue()
