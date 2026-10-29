from config.settings import settings
from core.animation import AnimatedProcessor
from core.gpu_budget import budget
from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import BackgroundRemovalProcessor


def _gpu_available() -> bool:
    return settings.gpu_enabled and not budget.exhausted()


class BackgroundRemovalService(ImageJobService):
    """Service layer for background removal operations"""

    def __init__(self):
        processor = AnimatedProcessor(
            BackgroundRemovalProcessor(), max_frames=settings.max_animation_frames, animate=_gpu_available
        )
        super().__init__(ServiceType.BACKGROUND_REMOVAL, processor, "background removal")
