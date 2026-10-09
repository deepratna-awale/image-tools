from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from typing import List
import logging

from core.job_router import add_job_routes, read_image, read_images
from core.public_api import charge_images
from core.models.responses import JobSubmissionResponse, BatchJobSubmissionResponse
from .service import BackgroundRemovalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/background-removal", tags=["Background Removal"])

# Initialize service
bg_service = BackgroundRemovalService()


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_background_removal(request: Request, file: UploadFile = File(...)):
    """Queue background removal job"""
    try:
        file_content, filename = await read_image(file)
        charge_images(request, 1)

        # Submit job
        job = await bg_service.submit_job(file_content, filename)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Background removal job queued successfully",
            service_type=job.service_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing background removal job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_background_removal(request: Request, files: List[UploadFile] = File(...)):
    """Queue batch background removal job"""
    try:
        files_data = await read_images(files)
        charge_images(request, len(files_data))

        # Submit batch job
        batch_job = await bg_service.submit_batch_job(files_data)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch background removal job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch background removal job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, bg_service)
