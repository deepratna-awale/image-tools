import asyncio
import io
import logging
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps

from config.settings import settings

logger = logging.getLogger(__name__)

# The canvas can grow to this many times the photo's width and height
MAX_GROWTH = 3.0
# Widest and tallest canvas shapes the model handles well
MAX_ASPECT = 4.0
MAX_PROMPT_LENGTH = 300
# How far (as a share of the work canvas's shorter side) the model also repaints inside
# the photo's extended edges, so the new part blends in instead of meeting it at a line
OVERLAP = 0.03


def parse_aspect_ratio(text: str) -> float:
    """"16:9", "16x9", "1.5" -> width / height"""
    try:
        parts = text.replace("x", ":").replace("/", ":").split(":")
        ratio = float(parts[0]) / float(parts[1]) if len(parts) == 2 else float(parts[0])
    except (ValueError, ZeroDivisionError):
        raise ValueError(f"Aspect ratio {text!r} is not like 16:9")
    if not 1 / MAX_ASPECT <= ratio <= MAX_ASPECT:
        raise ValueError(f"Aspect ratio must be between 1:{MAX_ASPECT:g} and {MAX_ASPECT:g}:1")
    return ratio


def plan_canvas(
    width: int,
    height: int,
    left: int = 0,
    top: int = 0,
    right: int = 0,
    bottom: int = 0,
    aspect_ratio: Optional[str] = None,
    zoom: Optional[float] = None,
) -> Tuple[int, int, int, int]:
    """Work out the extended canvas for a width x height photo.

    Either by the pixels to add on each side, or by a shape (`aspect_ratio`, the
    smallest canvas of that shape holding the photo) made `zoom` times larger, with the
    photo in the middle. Returns (canvas_w, canvas_h, photo_x, photo_y).
    """
    if aspect_ratio or zoom:
        ratio = parse_aspect_ratio(aspect_ratio) if aspect_ratio else width / height
        zoom = 1.0 if zoom is None else zoom
        if not 1 <= zoom <= MAX_GROWTH:
            raise ValueError(f"Zoom must be between 1 and {MAX_GROWTH:g}")
        canvas_w = max(width, round(height * ratio)) * zoom
        canvas_h = max(height, round(width / ratio)) * zoom
        canvas_w, canvas_h = max(width, round(canvas_w)), max(height, round(canvas_h))
        left, top = (canvas_w - width) // 2, (canvas_h - height) // 2
    else:
        if min(left, top, right, bottom) < 0:
            raise ValueError("Sides to add can't be negative")
        canvas_w, canvas_h = width + left + right, height + top + bottom

    if canvas_w - width < 2 and canvas_h - height < 2:
        raise ValueError("Nothing to extend: pick a different shape, zoom out or add pixels to a side")
    if canvas_w > MAX_GROWTH * width or canvas_h > MAX_GROWTH * height:
        raise ValueError(f"The new canvas can be at most {MAX_GROWTH:g}x the photo's width and height")
    if not 1 / MAX_ASPECT <= canvas_w / canvas_h <= MAX_ASPECT:
        raise ValueError(f"The new canvas must be between 1:{MAX_ASPECT:g} and {MAX_ASPECT:g}:1")
    if canvas_w * canvas_h > settings.outpaint_max_output_pixels:
        megapixels = settings.outpaint_max_output_pixels / 1_000_000
        raise ValueError(
            f"The result would be {canvas_w}x{canvas_h}; the most is {megapixels:.1f} megapixels. "
            "Extend it less or start from a smaller image."
        )
    return canvas_w, canvas_h, left, top


def work_size(canvas_w: int, canvas_h: int, multiple: int = 16) -> Tuple[int, int]:
    """The canvas's shape at about the model's working area, in multiples of `multiple`"""
    ratio = canvas_w / canvas_h
    area = settings.outpaint_work_pixels
    width = max(multiple, round((area * ratio) ** 0.5 / multiple) * multiple)
    height = max(multiple, round((area / ratio) ** 0.5 / multiple) * multiple)
    return width, height


def photo_weight(canvas_w: int, canvas_h: int, x: int, y: int, width: int, height: int, seam: int) -> np.ndarray:
    """How much of the original photo to keep at each canvas pixel: 1 inside it, fading to
    0 across `seam` pixels at each edge the canvas was extended past, 0 outside"""
    ramp_x = np.ones(width, np.float32)
    ramp_y = np.ones(height, np.float32)
    steps = (np.arange(seam, dtype=np.float32) + 1) / (seam + 1)
    if seam:
        if x > 0:
            ramp_x[:seam] = np.minimum(ramp_x[:seam], steps)
        if x + width < canvas_w:
            ramp_x[-seam:] = np.minimum(ramp_x[-seam:], steps[::-1])
        if y > 0:
            ramp_y[:seam] = np.minimum(ramp_y[:seam], steps)
        if y + height < canvas_h:
            ramp_y[-seam:] = np.minimum(ramp_y[-seam:], steps[::-1])
    weight = np.zeros((canvas_h, canvas_w), np.float32)
    weight[y:y + height, x:x + width] = np.minimum.outer(ramp_y, ramp_x)
    return weight


class OutpaintingProcessor:
    """Extends a photo past its edges: FLUX.1 Kontext paints the new area around it at
    about a megapixel, Real-ESRGAN brings that up to the photo's resolution, and the
    original pixels are put back on top. Needs the GPU endpoint."""

    async def process(
        self,
        image_data: bytes,
        left: int = 0,
        top: int = 0,
        right: int = 0,
        bottom: int = 0,
        aspect_ratio: Optional[str] = None,
        zoom: Optional[float] = None,
        prompt: str = "",
        **tuning,
    ) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: self._run(image_data, (left, top, right, bottom), aspect_ratio, zoom, prompt, tuning),
        )

    def _run(self, image_data: bytes, sides, aspect_ratio, zoom, prompt: str, tuning: dict) -> bytes:
        # torch is only imported by the worker and the GPU endpoint, never by the API
        from . import models

        if not models.on_gpu():
            raise ValueError("Outpainting is busy right now; please try again in a few minutes")
        source = Image.open(io.BytesIO(image_data))
        icc_profile = source.info.get("icc_profile")
        image = ImageOps.exif_transpose(source)
        width, height = image.size
        canvas_w, canvas_h, x, y = plan_canvas(width, height, *sides, aspect_ratio=aspect_ratio, zoom=zoom)
        rgb = np.asarray(image.convert("RGB"))

        # The photo on the work canvas, and the mask of what the model paints: everything
        # around it plus a thin band inside each extended edge
        work_w, work_h = work_size(canvas_w, canvas_h)
        # Rounding to multiples of 16 can stretch the shape a touch, so each axis scales on its own
        scale_x, scale_y = work_w / canvas_w, work_h / canvas_h
        box = (
            round(x * scale_x),
            round(y * scale_y),
            min(work_w, max(round((x + width) * scale_x), round(x * scale_x) + 1)),
            min(work_h, max(round((y + height) * scale_y), round(y * scale_y) + 1)),
        )
        band = max(1, round(OVERLAP * min(work_w, work_h)))
        work_photo = cv2.resize(rgb, (box[2] - box[0], box[3] - box[1]), interpolation=cv2.INTER_AREA)
        canvas = cv2.copyMakeBorder(
            work_photo, box[1], work_h - box[3], box[0], work_w - box[2], cv2.BORDER_REPLICATE
        )
        mask = np.full((work_h, work_w), 255, np.uint8)
        keep = [
            box[0] + (band if box[0] > 0 else 0),
            box[1] + (band if box[1] > 0 else 0),
            box[2] - (band if box[2] < work_w else 0),
            box[3] - (band if box[3] < work_h else 0),
        ]
        mask[keep[1]:keep[3], keep[0]:keep[2]] = 0

        painted = models.get_painter().paint(
            Image.fromarray(rgb), Image.fromarray(canvas), Image.fromarray(mask), prompt.strip(), **tuning
        )
        painted = np.asarray(painted.convert("RGB").resize((work_w, work_h), Image.LANCZOS))
        logger.info(f"Painted a {canvas_w}x{canvas_h} canvas at {work_w}x{work_h}")

        # Bring the painted canvas up to full size; Real-ESRGAN rather than plain
        # resizing when it has to grow much, so the new area isn't blurrier than the photo
        if canvas_w > 1.25 * work_w:
            painted = models.enlarge(painted)
        output = cv2.resize(
            painted,
            (canvas_w, canvas_h),
            interpolation=cv2.INTER_AREA if painted.shape[1] > canvas_w else cv2.INTER_LANCZOS4,
        )

        # The original photo back on top at full quality, blended into the new area
        # across the band the model repainted
        seam = max(1, round(band / max(scale_x, scale_y) * 0.75))
        weight = photo_weight(canvas_w, canvas_h, x, y, width, height, seam)[..., None]
        placed = np.zeros_like(output)
        placed[y:y + height, x:x + width] = rgb
        blended = placed * weight + output * (1 - weight)
        result = Image.fromarray(np.clip(blended.round(), 0, 255).astype(np.uint8))

        buffer = io.BytesIO()
        result.save(buffer, format="PNG", icc_profile=icc_profile)
        return buffer.getvalue()
