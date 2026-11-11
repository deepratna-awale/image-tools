from core.job_service import ImageJobService
from core.models.job import ServiceType
from .processor import ObjectRemovalProcessor


class ObjectRemovalService(ImageJobService):
    """Service layer for the object eraser"""

    def __init__(self):
        super().__init__(ServiceType.OBJECT_REMOVAL, ObjectRemovalProcessor(), "object-removal")
