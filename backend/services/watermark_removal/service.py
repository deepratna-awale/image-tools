import asyncio
from typing import Any, Dict

from core.job_service import ImageJobService
from core.models.job import Job, ServiceType
from .detector import detect_text, mask_from_boxes, open_image
from .processor import WatermarkRemovalProcessor


class NoWatermarkFound(ValueError):
    pass


def find_watermark(image_data: bytes) -> bytes:
    """A mask of the text in an image (CPU, well under a second)"""
    image = open_image(image_data)
    boxes = detect_text(image)
    if not boxes:
        raise NoWatermarkFound("No watermark text found; mark the watermark yourself")
    return mask_from_boxes(image.size, boxes)


class WatermarkRemovalService(ImageJobService):
    """Service layer for the watermark remover"""

    def __init__(self):
        super().__init__(ServiceType.WATERMARK_REMOVAL, WatermarkRemovalProcessor(), "watermark removal")

    async def _processor_arguments(self, job: Job) -> Dict[str, Any]:
        """Jobs sent without a mask find the text to remove here, on the worker's CPU,
        so only the inpainting goes to the GPU"""
        arguments = await super()._processor_arguments(job)
        if "mask" not in arguments:
            image_data = await self.storage_manager.download_file(job.input_file_path)
            arguments["mask"] = await asyncio.get_running_loop().run_in_executor(None, find_watermark, image_data)
        return arguments
