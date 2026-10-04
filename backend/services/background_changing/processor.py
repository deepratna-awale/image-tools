import asyncio
import io
import logging
import re
from typing import Optional

from PIL import Image, ImageOps
from rembg import remove

from config.settings import settings
from services.background_removal.processor import get_rembg_session

logger = logging.getLogger(__name__)

DEFAULT_BACKGROUND_COLOR = "#ffffff"
HEX_COLOR = re.compile(r"^#?([0-9a-fA-F]{6})$")


def parse_hex_color(value: str) -> tuple[int, int, int]:
    match = HEX_COLOR.match(value.strip())
    if not match:
        raise ValueError(f"Invalid color: {value}")
    digits = match.group(1)
    return tuple(int(digits[i:i + 2], 16) for i in (0, 2, 4))


class BackgroundChangingProcessor:
    """Cuts the subject out and places it on a new background image or color"""

    async def process(
        self,
        image_data: bytes,
        background: Optional[bytes] = None,
        background_color: Optional[str] = None,
    ) -> bytes:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._change_background, image_data, background, background_color
        )

    def _change_background(
        self,
        image_data: bytes,
        background: Optional[bytes],
        background_color: Optional[str],
    ) -> bytes:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_data))).convert("RGB")
        cutout = remove(image, session=get_rembg_session(settings.rembg_model)).convert("RGBA")

        if background:
            new_background = ImageOps.exif_transpose(Image.open(io.BytesIO(background))).convert("RGB")
            # Cover the whole frame, cropping the background around its centre
            new_background = ImageOps.fit(new_background, cutout.size, Image.Resampling.LANCZOS)
        else:
            color = parse_hex_color(background_color or DEFAULT_BACKGROUND_COLOR)
            new_background = Image.new("RGB", cutout.size, color)

        result = Image.alpha_composite(new_background.convert("RGBA"), cutout).convert("RGB")
        output = io.BytesIO()
        result.save(output, format="PNG")
        return output.getvalue()
