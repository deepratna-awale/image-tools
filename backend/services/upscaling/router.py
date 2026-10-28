from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from typing import Any, Dict, List, Optional
import io
import logging

from PIL import Image, UnidentifiedImageError

from core.job_router import add_job_routes, read_image, read_images
from core.public_api import charge_images
from core.models.responses import BatchJobSubmissionResponse, JobSubmissionResponse
from .processor import STYLES, plan_size
from .service import UpscalingService

logger = logging.getLogger(__name__)

ORIENTATION_TAG = 0x0112

router = APIRouter(prefix="/upscaling", tags=["Upscaling"])

# Initialize service
upscaling_service = UpscalingService()


def _parameters(
    scale: Optional[float], width: Optional[int], height: Optional[int], style: Optional[str]
) -> Dict[str, Any]:
    style = style or "auto"
    if style not in STYLES:
        raise HTTPException(status_code=400, detail=f"style must be one of: {', '.join(STYLES)}")
    for name, value in (("width", width), ("height", height)):
        if value is not None and value < 1:
            raise HTTPException(status_code=400, detail=f"{name} must be a positive number of pixels")
    parameters: Dict[str, Any] = {"style": style}
    # A target size wins over a scale
    if width or height:
        parameters.update({name: value for name, value in (("width", width), ("height", height)) if value})
    elif scale is not None:
        parameters["scale"] = scale
    return parameters


def _check_size(content: bytes, filename: str, parameters: Dict[str, Any]) -> None:
    """Reject sizes the worker would refuse before queuing, from the image header alone"""
    try:
        image = Image.open(io.BytesIO(content))
        width, height = image.size
        # EXIF orientations 5-8 are rotated a quarter turn, as the worker will see them
        if image.getexif().get(ORIENTATION_TAG, 1) > 4:
            width, height = height, width
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail=f"{filename} is not an image we can read")
    try:
        plan_size(width, height, parameters.get("scale"), parameters.get("width"), parameters.get("height"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_upscaling(
    request: Request,
    file: UploadFile = File(...),
    scale: Optional[float] = Form(None),
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
    style: Optional[str] = Form(None),
):
    """Queue an upscaling job: by `scale` (1-4, default 2) or to an exact `width`/`height`"""
    try:
        parameters = _parameters(scale, width, height, style)
        file_content, filename = await read_image(file)
        _check_size(file_content, filename, parameters)
        charge_images(request, 1)

        job = await upscaling_service.submit_job(file_content, filename, parameters)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Upscaling job queued successfully",
            service_type=job.service_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing upscaling job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_upscaling(
    request: Request,
    files: List[UploadFile] = File(...),
    scale: Optional[float] = Form(None),
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
    style: Optional[str] = Form(None),
):
    """Queue upscaling jobs for several images with the same settings"""
    try:
        parameters = _parameters(scale, width, height, style)
        files_data = await read_images(files)
        for content, filename in files_data:
            _check_size(content, filename, parameters)
        charge_images(request, len(files_data))

        batch_job = await upscaling_service.submit_batch_job(files_data, parameters)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch upscaling job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch upscaling job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, upscaling_service)
