from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import BackgroundRemovalProcessor


class BackgroundRemovalService(ImageJobService):
    """Service layer for background removal operations"""

    def __init__(self):
        super().__init__(ServiceType.BACKGROUND_REMOVAL, BackgroundRemovalProcessor(), "background removal")
