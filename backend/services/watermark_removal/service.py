from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import WatermarkRemovalProcessor


class WatermarkRemovalService(ImageJobService):
    """Service layer for the watermark remover"""

    def __init__(self):
        super().__init__(ServiceType.WATERMARK_REMOVAL, WatermarkRemovalProcessor(), "watermark removal")
