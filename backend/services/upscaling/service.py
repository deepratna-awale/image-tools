from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import UpscalingProcessor


class UpscalingService(ImageJobService):
    """Service layer for the upscaler"""

    def __init__(self):
        super().__init__(ServiceType.UPSCALING, UpscalingProcessor(), "upscaling")
