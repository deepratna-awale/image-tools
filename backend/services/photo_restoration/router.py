from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from typing import Any, Dict, List, Optional
import io
import logging

from PIL import Image, UnidentifiedImageError

from config.settings import settings
from core.job_router import add_job_routes, read_image, read_images
from core.public_api import charge_images
from core.models.responses import BatchJobSubmissionResponse, JobSubmissionResponse
from .processor import COLORIZE_CHOICES
from .service import PhotoRestorationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/photo-restoration", tags=["Photo Restoration"])

photo_restoration_service = PhotoRestorationService()


def _parameters(faces: Optional[bool], colorize: Optional[str], strength: Optional[float]) -> Dict[str, Any]:
    faces = True if faces is None else faces
    colorize = colorize or "auto"
    if colorize not in COLORIZE_CHOICES:
        raise HTTPException(status_code=400, detail=f"colorize must be one of: {', '.join(COLORIZE_CHOICES)}")
    if not faces and colorize == "no":
        raise HTTPException(status_code=400, detail="Choose to restore faces, colorize, or both")
    strength = 1.0 if strength is None else strength
    if not 0 <= strength <= 1:
        raise HTTPException(status_code=400, detail="strength must be between 0 and 1")
    return {"faces": faces, "colorize": colorize, "strength": strength}


def _check_size(content: bytes, filename: str) -> None:
    """Reject images the worker would refuse before queuing, from the header alone"""
    try:
        width, height = Image.open(io.BytesIO(content)).size
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail=f"{filename} is not an image we can read")
    if width * height > settings.restore_max_input_pixels:
        megapixels = settings.restore_max_input_pixels / 1_000_000
        raise HTTPException(status_code=400, detail=f"{filename} is too large; the most is {megapixels:.0f} megapixels")


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_photo_restoration(
    request: Request,
    file: UploadFile = File(...),
    faces: Optional[bool] = Form(None),
    colorize: Optional[str] = Form(None),
    strength: Optional[float] = Form(None),
):
    """Queue a job: redraw blurry faces (`faces`, default true, `strength` 0-1) and colour the
    photo (`colorize`: `auto` for black and white photos only, `yes` or `no`)"""
    try:
        parameters = _parameters(faces, colorize, strength)
        file_content, filename = await read_image(file)
        _check_size(file_content, filename)
        charge_images(request, 1)

        job = await photo_restoration_service.submit_job(file_content, filename, parameters)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Photo restoration job queued successfully",
            service_type=job.service_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing photo restoration job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_photo_restoration(
    request: Request,
    files: List[UploadFile] = File(...),
    faces: Optional[bool] = Form(None),
    colorize: Optional[str] = Form(None),
    strength: Optional[float] = Form(None),
):
    """Queue restoration jobs for several photos with the same settings"""
    try:
        parameters = _parameters(faces, colorize, strength)
        files_data = await read_images(files)
        for content, filename in files_data:
            _check_size(content, filename)
        charge_images(request, len(files_data))

        batch_job = await photo_restoration_service.submit_batch_job(files_data, parameters)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch photo restoration job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch photo restoration job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, photo_restoration_service)
