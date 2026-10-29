import asyncio
import io
import logging
from typing import Iterator, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

from config.settings import settings

logger = logging.getLogger(__name__)

MODES = ("remove", "detect")
# Pixels of surrounding image each masked region is cropped with (at least), so the
# model sees what to continue
CONTEXT = 96
# Grow the mask a little: watermarks have soft, anti-aliased or shadowed edges
GROW = 4
# Blend the filled pixels into the original over this many pixels past the mask edge
FEATHER = 3
# How far the classic inpaint that seeds the diffusion fill looks around each pixel
PREFILL_RADIUS = 5


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


def mask_from_boxes(size: Tuple[int, int], boxes: List[List[List[float]]]) -> np.ndarray:
    """A mask (uint8, 255 where to remove) of the given size with the boxes filled"""
    width, height = size
    mask = np.zeros((height, width), np.uint8)
    for box in boxes:
        cv2.fillPoly(mask, [np.round(np.array(box)).astype(np.int32)], 255)
    return mask


def png(pixels: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(pixels).save(buffer, format="PNG")
    return buffer.getvalue()


def work_crop(left: int, top: int, right: int, bottom: int, width: int, height: int) -> Tuple[int, int, int, int]:
    """Pad a thin crop (a line of text) to at most 3:1, inside the image: diffusion
    models fill better with context on every side"""
    w, h = right - left, bottom - top
    if w > 3 * h:
        pad = (w // 3 - h + 1) // 2
        top, bottom = max(0, top - pad), min(height, bottom + pad)
    elif h > 3 * w:
        pad = (h // 3 - w + 1) // 2
        left, right = max(0, left - pad), min(width, right + pad)
    return left, top, right, bottom


class WatermarkRemovalProcessor:
    """Finds watermarks with Florence-2 and repaints them with a diffusion inpainting
    model. Needs the GPU endpoint: these models are far too heavy for the server's CPU."""

    async def process(self, image_data: bytes, mask: Optional[bytes] = None, mode: str = "remove") -> bytes:
        return await asyncio.get_running_loop().run_in_executor(None, self._run, image_data, mask, mode)

    def _run(self, image_data: bytes, mask_data: Optional[bytes], mode: str) -> bytes:
        # torch is only imported by the worker and the GPU endpoint, never by the API
        from . import models

        if not models.on_gpu():
            raise ValueError("The watermark remover is busy right now; please try again in a few minutes")
        source = Image.open(io.BytesIO(image_data))
        icc_profile = source.info.get("icc_profile")
        image = ImageOps.exif_transpose(source)
        width, height = image.size
        if width * height > settings.watermark_max_input_pixels:
            megapixels = settings.watermark_max_input_pixels / 1_000_000
            raise ValueError(f"This image is too large; the most is {megapixels:.0f} megapixels")

        if mode == "detect" or mask_data is None:
            holes = mask_from_boxes((width, height), models.get_finder().find(image)) > 0
            if mode == "detect":
                # The page shows this so people can fix it; an empty one is fine
                return png(holes.astype(np.uint8) * 255)
            if not holes.any():
                raise ValueError("No watermark found; mark it with the brush and try again")
        else:
            holes = load_mask(mask_data, (width, height))
            if not holes.any():
                raise ValueError("The mask is empty: mark the watermark to remove")
        grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * GROW + 1, 2 * GROW + 1))
        holes = cv2.dilate(holes.astype(np.uint8), grow)

        alpha = None
        if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
            alpha = image.convert("RGBA").getchannel("A")
        rgb = np.array(image.convert("RGB"))

        filler = models.get_filler()
        for region in regions(holes.astype(bool)):
            left, top, right, bottom = work_crop(*region, width, height)
            crop_w, crop_h = right - left, bottom - top
            crop_rgb = rgb[top:bottom, left:right]
            crop_mask = holes[top:bottom, left:right]
            # The model works best near its training size, so small crops are enlarged too
            factor = settings.watermark_work_size / max(crop_w, crop_h)
            size = tuple(max(filler.multiple, round(side * factor / filler.multiple) * filler.multiple) for side in (crop_w, crop_h))
            # Diffusion fill tends to paint new lettering into a text-shaped hole, so it starts
            # from a plain classic inpaint of the hole and only reworks that into real detail
            prefilled = cv2.inpaint(crop_rgb, crop_mask, PREFILL_RADIUS, cv2.INPAINT_TELEA)
            work_rgb = Image.fromarray(prefilled).resize(size, Image.LANCZOS)
            work_mask = Image.fromarray(crop_mask * 255).resize(size, Image.BILINEAR).point(lambda v: 255 if v else 0)
            filled = filler.fill(work_rgb, work_mask).convert("RGB").resize((crop_w, crop_h), Image.LANCZOS)
            logger.info(f"Repainted a {crop_w}x{crop_h} region at {size[0]}x{size[1]}")

            weight = cv2.GaussianBlur(crop_mask.astype(np.float32), (0, 0), FEATHER)
            weight = np.maximum(weight, crop_mask)[..., None]
            blended = crop_rgb * (1 - weight) + np.asarray(filled) * weight
            rgb[top:bottom, left:right] = np.clip(blended.round(), 0, 255).astype(np.uint8)

        output = Image.fromarray(rgb)
        if alpha is not None:
            output.putalpha(alpha)
        buffer = io.BytesIO()
        output.save(buffer, format="PNG", icc_profile=icc_profile)
        return buffer.getvalue()
