import asyncio
import io
import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageOps

from config.settings import settings
from services.watermark_removal.processor import load_mask, regions

logger = logging.getLogger(__name__)

# Pixels of surrounding image each masked area is cropped with (at least): what the
# model continues into the hole
CONTEXT = 128
# Grow the mask a little: people paint right up to an object's edge, and its shadow
# or blur reaches a bit past it
GROW = 6
# Blend the filled pixels into the original over this many pixels past the mask edge
FEATHER = 3


class ObjectRemovalProcessor:
    """Removes whatever is painted on the mask (people, wires, spots, text) with LaMa,
    which fills the hole from the surrounding background. Runs on the server's CPU."""

    # Runs on the CPU even when a GPU endpoint is set up: it is quick there, and a GPU
    # cold start would take far longer than the job
    cpu_only = True

    async def process(self, image_data: bytes, mask: Optional[bytes] = None) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(None, self._run, image_data, mask)

    def _run(self, image_data: bytes, mask_data: Optional[bytes]) -> bytes:
        from . import models

        if mask_data is None:
            raise ValueError("Paint over what you want to remove first")
        source = Image.open(io.BytesIO(image_data))
        icc_profile = source.info.get("icc_profile")
        image = ImageOps.exif_transpose(source)
        width, height = image.size
        if width * height > settings.eraser_max_input_pixels:
            megapixels = settings.eraser_max_input_pixels / 1_000_000
            raise ValueError(f"This image is too large; the most is {megapixels:.0f} megapixels")

        holes = load_mask(mask_data, (width, height))
        if not holes.any():
            raise ValueError("The mask is empty: paint over what you want to remove")
        grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * GROW + 1, 2 * GROW + 1))
        holes = cv2.dilate(holes.astype(np.uint8), grow).astype(bool)

        alpha = None
        if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
            alpha = image.convert("RGBA").getchannel("A")
        rgb = np.array(image.convert("RGB"))

        eraser = models.get_eraser()
        for left, top, right, bottom in regions(holes, CONTEXT):
            crop_w, crop_h = right - left, bottom - top
            crop_rgb = rgb[top:bottom, left:right]
            crop_mask = holes[top:bottom, left:right]
            # Large areas are filled at a smaller size, which LaMa handles well, then enlarged
            factor = min(1.0, settings.eraser_work_size / max(crop_w, crop_h))
            if factor < 1:
                size = (max(8, round(crop_w * factor)), max(8, round(crop_h * factor)))
                work_rgb = cv2.resize(crop_rgb, size, interpolation=cv2.INTER_AREA)
                work_mask = cv2.resize(crop_mask.astype(np.uint8), size, interpolation=cv2.INTER_LINEAR) > 0
                filled = cv2.resize(eraser.fill(work_rgb, work_mask), (crop_w, crop_h), interpolation=cv2.INTER_CUBIC)
            else:
                filled = eraser.fill(crop_rgb, crop_mask)
            logger.info(f"Erased a {crop_w}x{crop_h} region at {factor:.2f}x")

            weight = cv2.GaussianBlur(crop_mask.astype(np.float32), (0, 0), FEATHER)
            weight = np.maximum(weight, crop_mask)[..., None]
            blended = crop_rgb * (1 - weight) + filled.astype(np.float32) * weight
            rgb[top:bottom, left:right] = np.clip(blended.round(), 0, 255).astype(np.uint8)

        output = Image.fromarray(rgb)
        if alpha is not None:
            output.putalpha(alpha)
        buffer = io.BytesIO()
        output.save(buffer, format="PNG", icc_profile=icc_profile)
        return buffer.getvalue()
