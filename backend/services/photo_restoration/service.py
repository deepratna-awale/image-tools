from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import PhotoRestorationProcessor


class PhotoRestorationService(ImageJobService):
    """Service layer for the old photo restorer"""

    def __init__(self):
        super().__init__(ServiceType.PHOTO_RESTORATION, PhotoRestorationProcessor(), "photo-restoration")
