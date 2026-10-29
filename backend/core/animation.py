"""Animated images (GIF, WebP, APNG) through processors that handle one still image.

AnimatedProcessor splits an animation into frames, runs each frame through the
wrapped processor and stitches the results into a lossless animated WebP,
which keeps transparency and every pixel of the cutouts. Still images go straight to the wrapped processor.
"""

import asyncio
import io
import logging
from typing import Callable, List

from PIL import Image, ImageSequence

logger = logging.getLogger(__name__)

DEFAULT_FRAME_MS = 100
# Lossless output unless that gets too big to keep (long, large animations)
MAX_LOSSLESS_BYTES = 25 * 1024 * 1024
LOSSY_QUALITY = 95


def is_animated(image_data: bytes) -> bool:
    try:
        with Image.open(io.BytesIO(image_data)) as image:
            return getattr(image, "n_frames", 1) > 1
    except Exception:
        return False


def image_mime_type(data: bytes) -> str:
    """MIME type of a result, from its first bytes"""
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return "image/png"


def _sample(count: int, limit: int) -> List[int]:
    """Indexes of at most `limit` frames spread evenly over `count`"""
    if count <= limit:
        return list(range(count))
    return sorted({round(i * count / limit) for i in range(limit)})


class AnimatedProcessor:
    """Wraps a still-image processor so animations come back animated.

    `inner` may be swapped for another processor (the worker puts the GPU one
    there), so each frame goes to the GPU on its own. Animations longer than
    `max_frames` keep that many frames, spread over the same running time.
    When `animate()` is false (no GPU to spare), only the first frame is processed.
    """

    def __init__(self, inner, max_frames: int = 100, concurrency: int = 4,
                 animate: Callable[[], bool] = lambda: True):
        self.inner = inner
        self.max_frames = max_frames
        self.concurrency = concurrency
        self.animate = animate

    async def process(self, image_data: bytes, **arguments) -> bytes:
        if not is_animated(image_data) or not self.animate():
            return await self.inner.process(image_data, **arguments)

        frames, durations, loop = self._split(image_data)
        logger.info(f"Processing an animation of {len(frames)} frames")
        slots = asyncio.Semaphore(self.concurrency)

        async def run(frame: bytes) -> Image.Image:
            async with slots:
                result = await self.inner.process(frame, **arguments)
            return Image.open(io.BytesIO(result)).convert("RGBA")

        results = await asyncio.gather(*(run(frame) for frame in frames))
        return self._join(results, durations, loop)

    def _split(self, image_data: bytes):
        with Image.open(io.BytesIO(image_data)) as image:
            loop = image.info.get("loop", 0)
            all_frames = []
            for frame in ImageSequence.Iterator(image):
                all_frames.append((frame.convert("RGBA"), frame.info.get("duration") or DEFAULT_FRAME_MS))

        keep = _sample(len(all_frames), self.max_frames)
        frames, durations = [], []
        for n, index in enumerate(keep):
            end = keep[n + 1] if n + 1 < len(keep) else len(all_frames)
            # A kept frame stays up for the frames dropped after it
            durations.append(sum(duration for _, duration in all_frames[index:end]))
            buffer = io.BytesIO()
            all_frames[index][0].save(buffer, format="PNG")
            frames.append(buffer.getvalue())
        return frames, durations, loop

    @staticmethod
    def _join(frames: List[Image.Image], durations: List[int], loop: int) -> bytes:
        size = frames[0].size
        frames = [frame if frame.size == size else frame.resize(size) for frame in frames]

        def encode(**options) -> bytes:
            buffer = io.BytesIO()
            frames[0].save(
                buffer,
                format="WEBP",
                save_all=True,
                append_images=frames[1:],
                duration=durations,
                loop=loop,
                method=4,
                # Every frame whole: partial frames can turn transparent areas opaque
                kmin=1,
                kmax=1,
                **options,
            )
            return buffer.getvalue()

        result = encode(
            lossless=True,
            quality=80,  # with lossless, how hard to compress (slower, smaller), not quality
        )
        if len(result) > MAX_LOSSLESS_BYTES:
            logger.info(f"Lossless animation is {len(result) / 1e6:.0f} MB; saving it at quality {LOSSY_QUALITY}")
            result = encode(quality=LOSSY_QUALITY)
        return result
