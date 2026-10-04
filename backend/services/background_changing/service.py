from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import BackgroundChangingProcessor


class BackgroundChangingService(ImageJobService):
    """Service layer for background changing operations"""

    def __init__(self):
        super().__init__(ServiceType.BACKGROUND_CHANGING, BackgroundChangingProcessor(), "background changing")
