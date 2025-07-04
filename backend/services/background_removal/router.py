from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional
import io
import uuid
import logging

from core.models.job import Job, ServiceType, JobStatus
from core.models.responses import JobSubmissionResponse, JobStatusResponse, APIResponse
from .service import BackgroundRemovalService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/background-removal", tags=["Background Removal"])

# Initialize service
bg_service = BackgroundRemovalService()


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_background_removal(file: UploadFile = File(...)):
    """Queue background removal job"""
    try:
        # Validate file
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read file content
        file_content = await file.read()
        
        # Submit job
        job = await bg_service.submit_job(file_content, file.filename)
        
        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Background removal job queued successfully",
            service_type=job.service_type
        )
        
    except Exception as e:
        logger.error(f"Error queuing background removal job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get job status"""
    try:
        job_result = await bg_service.get_job_status(job_id)
        if not job_result:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return JobStatusResponse(
            job_id=job_result.job_id,
            status=job_result.status,
            service_type=job_result.service_type,
            error_message=job_result.error_message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/result/{job_id}")
async def get_job_result(job_id: str):
    """Download processed image"""
    try:
        result_data = await bg_service.get_job_result(job_id)
        if not result_data:
            raise HTTPException(status_code=404, detail="Result not found")
        
        return StreamingResponse(
            io.BytesIO(result_data),
            media_type="image/png",
            headers={"Content-Disposition": f"attachment; filename=processed_{job_id}.png"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-direct")
async def process_direct(file: UploadFile = File(...)):
    """Process background removal directly without queueing"""
    try:
        # Validate file
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read file content
        file_content = await file.read()
        
        # Process directly
        result_data = await bg_service.process_direct(file_content)
        
        return StreamingResponse(
            io.BytesIO(result_data),
            media_type="image/png",
            headers={"Content-Disposition": f"attachment; filename=processed_direct.png"}
        )
        
    except Exception as e:
        logger.error(f"Error in direct processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_service_stats():
    """Get background removal service statistics"""
    try:
        stats = await bg_service.get_stats()
        return APIResponse(
            success=True,
            message="Stats retrieved successfully",
            data=stats
        )
    except Exception as e:
        logger.error(f"Error getting service stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
