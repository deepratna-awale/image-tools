import io

import pytest
from PIL import Image

from core.animation import AnimatedProcessor, image_mime_type, is_animated


def make_animation(frames: int, fmt: str = "GIF", duration: int = 50) -> bytes:
    images = [Image.new("RGB", (8, 6), (i * 20 % 256, 0, 0)) for i in range(frames)]
    buffer = io.BytesIO()
    images[0].save(buffer, format=fmt, save_all=True, append_images=images[1:], duration=duration, loop=0)
    return buffer.getvalue()


def make_still() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 6), "white").save(buffer, format="PNG")
    return buffer.getvalue()


class CutoutProcessor:
    """Stands in for rembg: returns the frame as a PNG with its left half transparent"""

    def __init__(self):
        self.calls = 0

    async def process(self, image_data: bytes, **arguments) -> bytes:
        self.calls += 1
        image = Image.open(io.BytesIO(image_data)).convert("RGBA")
        for x in range(image.width // 2):
            for y in range(image.height):
                image.putpixel((x, y), (0, 0, 0, 0))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()


@pytest.mark.parametrize("fmt", ["GIF", "WEBP"])
async def test_animation_comes_back_as_animated_webp(fmt):
    inner = CutoutProcessor()
    result = await AnimatedProcessor(inner).process(make_animation(5, fmt))

    assert inner.calls == 5
    assert image_mime_type(result) == "image/webp"
    image = Image.open(io.BytesIO(result))
    assert image.n_frames == 5
    assert image.size == (8, 6)
    image.seek(2)
    rgba = image.convert("RGBA")
    assert rgba.getpixel((0, 0))[3] == 0
    assert rgba.getpixel((7, 0))[3] == 255


async def test_still_image_goes_straight_through():
    inner = CutoutProcessor()
    result = await AnimatedProcessor(inner).process(make_still())

    assert inner.calls == 1
    assert image_mime_type(result) == "image/png"


async def test_long_animation_keeps_max_frames_and_running_time():
    inner = CutoutProcessor()
    result = await AnimatedProcessor(inner, max_frames=4).process(make_animation(10, duration=50))

    assert inner.calls == 4
    image = Image.open(io.BytesIO(result))
    assert image.n_frames == 4
    total = 0
    for index in range(image.n_frames):
        image.seek(index)
        image.load()
        total += image.info["duration"]
    assert total == 500


async def test_without_gpu_only_the_first_frame_is_cut_out():
    inner = CutoutProcessor()
    result = await AnimatedProcessor(inner, animate=lambda: False).process(make_animation(5))

    assert inner.calls == 1
    assert not is_animated(result)


def test_mime_types():
    assert image_mime_type(make_animation(2, "WEBP")) == "image/webp"
    assert image_mime_type(make_animation(2, "GIF")) == "image/gif"
    assert image_mime_type(make_still()) == "image/png"
