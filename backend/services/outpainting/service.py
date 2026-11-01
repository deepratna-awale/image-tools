from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import OutpaintingProcessor


class OutpaintingService(ImageJobService):
    """Service layer for outpainting"""

    def __init__(self):
        super().__init__(ServiceType.OUTPAINTING, OutpaintingProcessor(), "outpainting")
