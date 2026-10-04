from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Any, Dict, List, Optional
import logging

from core.job_router import add_job_routes, read_image, read_images
from core.models.responses import JobSubmissionResponse, BatchJobSubmissionResponse
from .processor import parse_hex_color
from .service import BackgroundChangingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/background-changing", tags=["Background Changing"])

# Initialize service
bg_changing_service = BackgroundChangingService()


async def _background_inputs(
    background: Optional[UploadFile], background_color: Optional[str]
) -> tuple[Dict[str, Any], Dict[str, tuple[bytes, str]]]:
    """A background image wins over a color; with neither the background is white"""
    if background is not None and background.filename:
        return {}, {"background": await read_image(background)}
    if background_color:
        try:
            parse_hex_color(background_color)
        except ValueError:
            raise HTTPException(status_code=400, detail="background_color must be a hex color like #1e90ff")
        return {"background_color": background_color}, {}
    return {}, {}


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_background_changing(
    file: UploadFile = File(...),
    background: Optional[UploadFile] = File(None),
    background_color: Optional[str] = Form(None),
):
    """Queue background changing job"""
    try:
        file_content, filename = await read_image(file)
        parameters, assets = await _background_inputs(background, background_color)

        job = await bg_changing_service.submit_job(file_content, filename, parameters, assets)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Background changing job queued successfully",
            service_type=job.service_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing background changing job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_background_changing(
    files: List[UploadFile] = File(...),
    background: Optional[UploadFile] = File(None),
    background_color: Optional[str] = Form(None),
):
    """Queue batch background changing job; every image gets the same background"""
    try:
        files_data = await read_images(files)
        parameters, assets = await _background_inputs(background, background_color)

        batch_job = await bg_changing_service.submit_batch_job(files_data, parameters, assets)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch background changing job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch background changing job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, bg_changing_service)
