from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from typing import Any, Dict, List, Optional
import io
import logging

from PIL import Image, UnidentifiedImageError

from core.job_router import add_job_routes, read_image, read_images
from core.public_api import charge_images
from core.models.responses import BatchJobSubmissionResponse, JobSubmissionResponse
from .processor import MAX_PROMPT_LENGTH, parse_aspect_ratio, plan_canvas
from .service import OutpaintingService

logger = logging.getLogger(__name__)

ORIENTATION_TAG = 0x0112

router = APIRouter(prefix="/outpainting", tags=["Outpainting"])

# Initialize service
outpainting_service = OutpaintingService()


def _parameters(
    left: Optional[int],
    top: Optional[int],
    right: Optional[int],
    bottom: Optional[int],
    aspect_ratio: Optional[str],
    zoom: Optional[float],
    prompt: Optional[str],
) -> Dict[str, Any]:
    prompt = (prompt or "").strip()
    if len(prompt) > MAX_PROMPT_LENGTH:
        raise HTTPException(status_code=400, detail=f"prompt can be at most {MAX_PROMPT_LENGTH} characters")
    parameters: Dict[str, Any] = {"prompt": prompt} if prompt else {}
    sides = {"left": left, "top": top, "right": right, "bottom": bottom}
    if aspect_ratio or zoom is not None:
        if any(sides.values()):
            raise HTTPException(status_code=400, detail="Send either aspect_ratio/zoom or left/top/right/bottom, not both")
        if aspect_ratio:
            try:
                parse_aspect_ratio(aspect_ratio)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            parameters["aspect_ratio"] = aspect_ratio
        if zoom is not None:
            parameters["zoom"] = zoom
        return parameters
    for name, value in sides.items():
        if value is not None and value < 0:
            raise HTTPException(status_code=400, detail=f"{name} can't be negative")
    parameters.update({name: value for name, value in sides.items() if value})
    if not any(sides.values()):
        raise HTTPException(
            status_code=400,
            detail="Say how to extend the image: aspect_ratio and/or zoom, or pixels to add with left/top/right/bottom",
        )
    return parameters


def _check_size(content: bytes, filename: str, parameters: Dict[str, Any]) -> None:
    """Reject canvases the worker would refuse before queuing, from the image header alone"""
    try:
        image = Image.open(io.BytesIO(content))
        width, height = image.size
        # EXIF orientations 5-8 are rotated a quarter turn, as the worker will see them
        if image.getexif().get(ORIENTATION_TAG, 1) > 4:
            width, height = height, width
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail=f"{filename} is not an image we can read")
    try:
        plan_canvas(width, height, **{key: value for key, value in parameters.items() if key != "prompt"})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"{filename}: {e}")


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_outpainting(
    request: Request,
    file: UploadFile = File(...),
    left: Optional[int] = Form(None),
    top: Optional[int] = Form(None),
    right: Optional[int] = Form(None),
    bottom: Optional[int] = Form(None),
    aspect_ratio: Optional[str] = Form(None),
    zoom: Optional[float] = Form(None),
    prompt: Optional[str] = Form(None),
):
    """Queue an outpainting job: extend the image to `aspect_ratio` (e.g. 16:9) and/or
    `zoom` out (1-3) around its centre, or add pixels to `left`/`top`/`right`/`bottom`.
    `prompt` optionally describes what to add."""
    try:
        parameters = _parameters(left, top, right, bottom, aspect_ratio, zoom, prompt)
        file_content, filename = await read_image(file)
        _check_size(file_content, filename, parameters)
        charge_images(request, 1)

        job = await outpainting_service.submit_job(file_content, filename, parameters)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Outpainting job queued successfully",
            service_type=job.service_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing outpainting job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_outpainting(
    request: Request,
    files: List[UploadFile] = File(...),
    left: Optional[int] = Form(None),
    top: Optional[int] = Form(None),
    right: Optional[int] = Form(None),
    bottom: Optional[int] = Form(None),
    aspect_ratio: Optional[str] = Form(None),
    zoom: Optional[float] = Form(None),
    prompt: Optional[str] = Form(None),
):
    """Queue outpainting jobs for several images with the same settings"""
    try:
        parameters = _parameters(left, top, right, bottom, aspect_ratio, zoom, prompt)
        files_data = await read_images(files)
        for content, filename in files_data:
            _check_size(content, filename, parameters)
        charge_images(request, len(files_data))

        batch_job = await outpainting_service.submit_batch_job(files_data, parameters)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch outpainting job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch outpainting job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, outpainting_service)
