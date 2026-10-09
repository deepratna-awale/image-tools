import asyncio
import io
import logging
from typing import Optional

import numpy as np
from PIL import Image, ImageOps

from .metadata import save_png

logger = logging.getLogger(__name__)

STRENGTH_NAMES = ("low", "medium", "high")
DEFAULT_STRENGTH = "medium"
# Larger images are cloaked at this size, so the job fits in memory and time on a small server
MAX_SIDE = 4096


class AIShieldProcessor:
    """Cloaks an image against Stable Diffusion's encoder and tags it as not for AI training"""

    def __init__(self):
        self._encoders = None

    def _encoder_cache(self):
        # torch is only imported by the worker, never by the API
        if self._encoders is None:
            from .cloak import EncoderCache

            self._encoders = EncoderCache()
        return self._encoders

    async def process(
        self,
        image_data: bytes,
        strength: str = DEFAULT_STRENGTH,
        cloak: bool = True,
        metadata: bool = True,
        creator: Optional[str] = None,
        copyright_notice: Optional[str] = None,
    ) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._protect, image_data, strength, cloak, metadata, creator, copyright_notice
        )

    def _protect(
        self,
        image_data: bytes,
        strength: str,
        cloak: bool,
        metadata: bool,
        creator: Optional[str],
        copyright_notice: Optional[str],
    ) -> bytes:
        source = Image.open(io.BytesIO(image_data))
        icc_profile = source.info.get("icc_profile")
        image = ImageOps.exif_transpose(source)
        if max(image.size) > MAX_SIDE:
            image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        alpha = image.getchannel("A") if image.mode in ("RGBA", "LA") or "transparency" in image.info else None
        rgb = np.asarray(image.convert("RGB"))

        if cloak:
            from .cloak import STRENGTHS, cloak as apply_cloak

            result = apply_cloak(rgb, self._encoder_cache().get(), STRENGTHS[strength])
            logger.info(
                "Cloak moved the latents towards the target: "
                + ", ".join(f"{b:.3f} -> {a:.3f}" for b, a in zip(result.target_gap_before, result.target_gap_after))
            )
            rgb = result.image

        output = Image.fromarray(rgb)
        if alpha is not None:
            output.putalpha(alpha)
        return save_png(output, creator, copyright_notice, add_notice=metadata, icc_profile=icc_profile)
