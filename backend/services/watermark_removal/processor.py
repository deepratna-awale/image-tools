import asyncio
import io
import logging
from typing import Iterator, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

from config.settings import settings

logger = logging.getLogger(__name__)

# Pixels of surrounding image each masked region is cropped with, so the model sees
# what to continue
CONTEXT = 128
# Grow the mask a little: watermarks have soft, anti-aliased or shadowed edges
GROW = 3
# Blend the filled pixels into the original over this many pixels past the mask edge
FEATHER = 2


def load_mask(mask_data: bytes, size: Tuple[int, int]) -> np.ndarray:
    """A mask image as a boolean array of the given size, true where to remove.

    A mask with transparency marks what's opaque (strokes painted on a clear layer, in
    any colour); one without marks what's light (white on black). A mask of another
    size is stretched to fit.
    """
    mask = Image.open(io.BytesIO(mask_data))
    if mask.mode in ("RGBA", "LA", "PA") or "transparency" in mask.info:
        alpha = mask.convert("RGBA").getchannel("A")
        if alpha.getextrema()[0] < 255:
            mask = alpha
    mask = mask.convert("L")
    if mask.size != size:
        mask = mask.resize(size, Image.BILINEAR)
    return np.asarray(mask) > 127


def regions(mask: np.ndarray, context: int = CONTEXT) -> Iterator[Tuple[int, int, int, int]]:
    """(left, top, right, bottom) crops covering every masked area plus `context` around it.

    Masked areas closer than twice the context share one crop.
    """
    height, width = mask.shape
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * context + 1, 2 * context + 1))
    grown = cv2.dilate(mask.astype(np.uint8), kernel)
    count, _, stats, _ = cv2.connectedComponentsWithStats(grown, connectivity=8)
    for left, top, w, h, _ in stats[1:count]:
        yield int(left), int(top), int(min(left + w, width)), int(min(top + h, height))


class WatermarkRemovalProcessor:
    """Removes watermarks, text or objects under a mask by inpainting them with LaMa"""

    async def process(self, image_data: bytes, mask: Optional[bytes] = None) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(None, self._remove, image_data, mask)

    def _remove(self, image_data: bytes, mask_data: Optional[bytes]) -> bytes:
        # torch is only imported by the worker, never by the API
        from .models import get_model, on_gpu

        if mask_data is None:
            raise ValueError("No mask: mark the watermark to remove")
        source = Image.open(io.BytesIO(image_data))
        icc_profile = source.info.get("icc_profile")
        image = ImageOps.exif_transpose(source)
        width, height = image.size
        if width * height > settings.watermark_max_input_pixels:
            megapixels = settings.watermark_max_input_pixels / 1_000_000
            raise ValueError(f"This image is too large; the most is {megapixels:.0f} megapixels")

        holes = load_mask(mask_data, (width, height))
        if not holes.any():
            raise ValueError("The mask is empty: mark the watermark to remove")
        grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * GROW + 1, 2 * GROW + 1))
        holes = cv2.dilate(holes.astype(np.uint8), grow)

        alpha = None
        if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
            alpha = image.convert("RGBA").getchannel("A")
        rgb = np.array(image.convert("RGB"))

        max_side = settings.watermark_max_side_gpu if on_gpu() else settings.watermark_max_side_cpu
        model = get_model()
        for left, top, right, bottom in regions(holes.astype(bool)):
            crop_rgb = rgb[top:bottom, left:right]
            crop_mask = holes[top:bottom, left:right]
            crop_w, crop_h = right - left, bottom - top
            factor = min(1.0, max_side / max(crop_w, crop_h))
            if factor < 1:
                size = (max(1, round(crop_w * factor)), max(1, round(crop_h * factor)))
                small_rgb = cv2.resize(crop_rgb, size, interpolation=cv2.INTER_AREA)
                # Any covered pixel stays covered after shrinking
                small_mask = cv2.resize(crop_mask.astype(np.float32), size, interpolation=cv2.INTER_AREA) > 0
                filled = cv2.resize(model.inpaint(small_rgb, small_mask), (crop_w, crop_h), interpolation=cv2.INTER_CUBIC)
            else:
                filled = model.inpaint(crop_rgb, crop_mask)
            logger.info(f"Inpainted a {crop_w}x{crop_h} region at {factor:.2f}x")

            weight = cv2.GaussianBlur(crop_mask.astype(np.float32), (0, 0), FEATHER)
            weight = np.maximum(weight, crop_mask)[..., None]
            blended = crop_rgb * (1 - weight) + filled * weight
            rgb[top:bottom, left:right] = np.clip(blended.round(), 0, 255).astype(np.uint8)

        output = Image.fromarray(rgb)
        if alpha is not None:
            output.putalpha(alpha)
        buffer = io.BytesIO()
        output.save(buffer, format="PNG", icc_profile=icc_profile)
        return buffer.getvalue()
