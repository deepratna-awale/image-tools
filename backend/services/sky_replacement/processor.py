import asyncio
import io
import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageOps

from .presets import render_preset
from .segmenter import SkySegmenter

logger = logging.getLogger(__name__)

DEFAULT_PRESET = "clear"
# Below this share of sky pixels the photo is treated as having no sky
MIN_SKY_FRACTION = 0.01
# How far the foreground's colors move towards the new sky's tone (L, a, b)
HARMONIZE_STRENGTH = np.array([0.15, 0.3, 0.3], dtype=np.float32)


def _load_rgb(data: bytes) -> np.ndarray:
    return np.asarray(ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB"))


def guided_filter(guide: np.ndarray, source: np.ndarray, radius: int, eps: float) -> np.ndarray:
    """Edge-aware smoothing so the mask follows tree lines and rooftops in the photo"""
    size = (2 * radius + 1, 2 * radius + 1)

    def box(x):
        return cv2.boxFilter(x, -1, size)

    mean_i, mean_p = box(guide), box(source)
    var_i = box(guide * guide) - mean_i * mean_i
    cov_ip = box(guide * source) - mean_i * mean_p
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    return box(a) * guide + box(b)


def fit_sky(sky: np.ndarray, width: int, height: int, horizon: int) -> np.ndarray:
    """Scale the new sky to cover the photo's sky area and extend it below the horizon"""
    sky_height = min(height, max(horizon, int(height * 0.3)))
    scale = max(width / sky.shape[1], sky_height / sky.shape[0])
    resized = cv2.resize(
        sky,
        (max(width, round(sky.shape[1] * scale)), max(sky_height, round(sky.shape[0] * scale))),
        interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC,
    )
    left = (resized.shape[1] - width) // 2
    top = (resized.shape[0] - sky_height) // 2
    cropped = resized[top:top + sky_height, left:left + width]
    return cv2.copyMakeBorder(cropped, 0, height - sky_height, 0, 0, cv2.BORDER_REPLICATE)


class SkyReplacementProcessor:
    """Finds the sky in a photo and replaces it with a preset or uploaded sky"""

    def __init__(self):
        self.segmenter = SkySegmenter()

    async def process(
        self,
        image_data: bytes,
        sky: Optional[bytes] = None,
        sky_preset: Optional[str] = None,
    ) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._replace_sky, image_data, sky, sky_preset
        )

    def _replace_sky(self, image_data: bytes, sky: Optional[bytes], sky_preset: Optional[str]) -> bytes:
        image = _load_rgb(image_data)
        new_sky = _load_rgb(sky) if sky else render_preset(sky_preset or DEFAULT_PRESET)
        height, width = image.shape[:2]

        probability = self.segmenter.sky_probability(image)
        sky_pixels = probability > 0.5
        if sky_pixels.mean() < MIN_SKY_FRACTION:
            raise ValueError("No sky was found in this photo")

        # Refine the coarse model output along edges in the photo
        guide = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
        radius = max(2, round(min(height, width) / 150))
        alpha = np.clip(guided_filter(guide, probability, radius, 1e-3), 0.0, 1.0)

        horizon = int(np.nonzero(sky_pixels.any(axis=1))[0].max()) + 1
        new_sky = fit_sky(new_sky, width, height, horizon + int(height * 0.05))

        # Shift the foreground's tone a little towards the new sky so it doesn't look pasted on
        image_lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.float32)
        sky_lab = cv2.cvtColor(new_sky, cv2.COLOR_RGB2LAB).astype(np.float32)
        weights = alpha[..., np.newaxis]
        old_tone = (image_lab * weights).sum(axis=(0, 1)) / weights.sum()
        new_tone = (sky_lab * weights).sum(axis=(0, 1)) / weights.sum()
        foreground_lab = np.clip(image_lab + HARMONIZE_STRENGTH * (new_tone - old_tone), 0, 255)
        foreground = cv2.cvtColor(foreground_lab.astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)

        result = new_sky.astype(np.float32) * weights + foreground * (1.0 - weights)
        output = io.BytesIO()
        Image.fromarray(np.clip(result, 0, 255).astype(np.uint8)).save(output, format="PNG")
        return output.getvalue()
