from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import SkyReplacementProcessor


class SkyReplacementService(ImageJobService):
    """Service layer for sky replacement operations"""

    def __init__(self):
        super().__init__(ServiceType.SKY_REPLACEMENT, SkyReplacementProcessor(), "sky replacement")
