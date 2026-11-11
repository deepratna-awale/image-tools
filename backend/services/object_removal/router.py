from fastapi import APIRouter, UploadFile, File, HTTPException, Request
import io
import logging

from PIL import Image, UnidentifiedImageError

from config.settings import settings
from core.job_router import add_job_routes, read_image
from core.public_api import charge_images
from core.models.responses import JobSubmissionResponse
from .service import ObjectRemovalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/object-removal", tags=["Object Removal"])

object_removal_service = ObjectRemovalService()


def _check_size(content: bytes, filename: str) -> None:
    """Reject images the worker would refuse before queuing, from the header alone"""
    try:
        width, height = Image.open(io.BytesIO(content)).size
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail=f"{filename} is not an image we can read")
    if width * height > settings.eraser_max_input_pixels:
        megapixels = settings.eraser_max_input_pixels / 1_000_000
        raise HTTPException(status_code=400, detail=f"{filename} is too large; the most is {megapixels:.0f} megapixels")


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_object_removal(request: Request, file: UploadFile = File(...), mask: UploadFile = File(...)):
    """Queue a job that removes what's marked in `mask` (white on black, or opaque strokes
    on a transparent layer, stretched to the image if its size differs) and fills the
    space from the background around it"""
    try:
        file_content, filename = await read_image(file)
        _check_size(file_content, filename)
        mask_content, mask_name = await read_image(mask)
        try:
            Image.open(io.BytesIO(mask_content)).size
        except (UnidentifiedImageError, OSError):
            raise HTTPException(status_code=400, detail="The mask is not an image we can read")
        charge_images(request, 1)

        job = await object_removal_service.submit_job(file_content, filename, {}, {"mask": (mask_content, mask_name)})

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Object removal job queued successfully",
            service_type=job.service_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing object removal job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, object_removal_service)
