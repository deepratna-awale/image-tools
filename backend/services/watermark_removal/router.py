from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from typing import Dict, List, Optional
import asyncio
import io
import logging

from PIL import Image, UnidentifiedImageError

from config.settings import settings
from core.job_router import add_job_routes, read_image, read_images
from core.public_api import charge_images
from core.models.responses import BatchJobSubmissionResponse, JobSubmissionResponse
from .detector import detect_text, open_image
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
    """With no mask the worker finds the watermark text by itself"""
    if mask is None or not mask.filename:
        return {}
    content, filename = await read_image(mask)
    try:
        Image.open(io.BytesIO(content)).size
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="The mask is not an image we can read")
    return {"mask": (content, filename)}


@router.post("/detect")
async def detect_watermark(file: UploadFile = File(...)):
    """Find text that looks like a watermark; returns padded boxes as corner points in
    pixels of the upright image (after its EXIF rotation)"""
    content, filename = await read_image(file)
    _check_size(content, filename)

    def detect():
        image = open_image(content)
        return {"width": image.width, "height": image.height, "boxes": detect_text(image)}

    try:
        return await asyncio.get_running_loop().run_in_executor(None, detect)
    except Exception as e:
        logger.error(f"Error detecting watermark: {e}")
        raise HTTPException(status_code=500, detail="Could not look for a watermark in this image")


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_watermark_removal(
    request: Request,
    file: UploadFile = File(...),
    mask: Optional[UploadFile] = File(None),
):
    """Queue a removal job: fills what's white in `mask`, or the text found automatically"""
    try:
        file_content, filename = await read_image(file)
        _check_size(file_content, filename)
        assets = await _mask_assets(mask)
        charge_images(request, 1)

        job = await watermark_removal_service.submit_job(file_content, filename, {}, assets)

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
):
    """Queue removal jobs for several images: one shared mask (stretched to each image),
    or each image's own text found automatically"""
    try:
        files_data = await read_images(files)
        for content, filename in files_data:
            _check_size(content, filename)
        assets = await _mask_assets(mask)
        charge_images(request, len(files_data))

        batch_job = await watermark_removal_service.submit_batch_job(files_data, {}, assets)

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
