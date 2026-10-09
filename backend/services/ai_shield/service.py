from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import AIShieldProcessor


class AIShieldService(ImageJobService):
    """Service layer for AI Shield (anti-AI cloak and do-not-train metadata)"""

    def __init__(self):
        super().__init__(ServiceType.AI_SHIELD, AIShieldProcessor(), "AI shield")
