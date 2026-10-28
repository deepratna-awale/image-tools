from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from typing import Dict, List, Optional
import io
import logging

from PIL import Image, UnidentifiedImageError

from config.settings import settings
from core.job_router import add_job_routes, read_image, read_images
from core.public_api import charge_images
from core.models.responses import BatchJobSubmissionResponse, JobSubmissionResponse
from .processor import MODES
from .service import WatermarkRemovalService

logger = logging.getLogger(__name__)

ORIENTATION_TAG = 0x0112

router = APIRouter(prefix="/watermark-removal", tags=["Watermark Removal"])

# Initialize service
watermark_removal_service = WatermarkRemovalService()


def _check_size(content: bytes, filename: str) -> None:
    """Reject images the worker would refuse before queuing, from the header alone"""
    try:
        width, height = Image.open(io.BytesIO(content)).size
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail=f"{filename} is not an image we can read")
    if width * height > settings.watermark_max_input_pixels:
        megapixels = settings.watermark_max_input_pixels / 1_000_000
        raise HTTPException(status_code=400, detail=f"{filename} is too large; the most is {megapixels:.0f} megapixels")


async def _mask_assets(mask: Optional[UploadFile]) -> Dict[str, tuple[bytes, str]]:
    """With no mask the watermark is found automatically"""
    if mask is None or not mask.filename:
        return {}
    content, filename = await read_image(mask)
    try:
        Image.open(io.BytesIO(content)).size
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="The mask is not an image we can read")
    return {"mask": (content, filename)}


def _parameters(mode: Optional[str]) -> Dict[str, str]:
    mode = mode or "remove"
    if mode not in MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of: {', '.join(MODES)}")
    return {"mode": mode}


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_watermark_removal(
    request: Request,
    file: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
    mode: Optional[str] = Form(None),
):
    """Queue a job: `remove` (default) repaints what's white in `mask`, or the watermark
    found automatically; `detect` only returns the mask of what it found"""
    try:
        parameters = _parameters(mode)
        file_content, filename = await read_image(file)
        _check_size(file_content, filename)
        assets = await _mask_assets(mask)
        charge_images(request, 1)

        job = await watermark_removal_service.submit_job(file_content, filename, parameters, assets)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Watermark removal job queued successfully",
            service_type=job.service_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing watermark removal job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_watermark_removal(
    request: Request,
    files: List[UploadFile] = File(...),
    mask: Optional[UploadFile] = File(None),
    mode: Optional[str] = Form(None),
):
    """Queue jobs for several images: one shared mask (stretched to each image), or each
    image's own watermark found automatically"""
    try:
        parameters = _parameters(mode)
        files_data = await read_images(files)
        for content, filename in files_data:
            _check_size(content, filename)
        assets = await _mask_assets(mask)
        charge_images(request, len(files_data))

        batch_job = await watermark_removal_service.submit_batch_job(files_data, parameters, assets)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch watermark removal job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch watermark removal job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, watermark_removal_service)
