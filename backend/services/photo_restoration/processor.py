import asyncio
import io
import logging

import numpy as np
from PIL import Image, ImageOps

from config.settings import settings

logger = logging.getLogger(__name__)

COLORIZE_CHOICES = ("auto", "yes", "no")


class PhotoRestorationProcessor:
    """Old photo restorer: colours black and white photos (DDColor) and redraws blurry or
    damaged faces (GFPGAN). Runs on the server's CPU."""

    # Quick enough on the CPU, and the GPU image doesn't carry these models
    cpu_only = True

    async def process(self, image_data: bytes, faces: bool = True, colorize: str = "auto", strength: float = 1.0) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(None, self._run, image_data, faces, colorize, strength)

    def _run(self, image_data: bytes, faces: bool, colorize: str, strength: float) -> bytes:
        from . import models

        if not faces and colorize == "no":
            raise ValueError("Choose to restore faces, colorize, or both")
        source = Image.open(io.BytesIO(image_data))
        icc_profile = source.info.get("icc_profile")
        image = ImageOps.exif_transpose(source)
        width, height = image.size
        if width * height > settings.restore_max_input_pixels:
            megapixels = settings.restore_max_input_pixels / 1_000_000
            raise ValueError(f"This image is too large; the most is {megapixels:.0f} megapixels")

        alpha = None
        if image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info:
            alpha = image.convert("RGBA").getchannel("A")
        rgb = np.array(image.convert("RGB"))

        changed = False
        if colorize == "yes" or (colorize == "auto" and models.is_grayscale(rgb)):
            rgb = models.get_colorizer().colorize(rgb)
            logger.info(f"Colorized a {width}x{height} photo")
            changed = True
        if faces:
            rgb, count = models.get_restorer().restore(rgb, max(0.0, min(1.0, strength)))
            logger.info(f"Restored {count} face(s)")
            changed = changed or count > 0
        if not changed:
            raise ValueError(
                "No faces found to restore"
                + (", and the photo is already in colour" if colorize == "auto" else "")
            )

        output = Image.fromarray(rgb)
        if alpha is not None:
            output.putalpha(alpha)
        buffer = io.BytesIO()
        output.save(buffer, format="PNG", icc_profile=icc_profile)
        return buffer.getvalue()
