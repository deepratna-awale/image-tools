from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional, List
import io
import uuid
import logging

from core.models.job import Job, ServiceType, JobStatus
from core.models.responses import (
    JobSubmissionResponse, 
    JobStatusResponse, 
    APIResponse,
    BatchJobSubmissionResponse,
    BatchJobStatusResponse
)
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


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_background_removal(files: List[UploadFile] = File(...)):
    """Queue batch background removal job"""
    try:
        # Validate files
        if len(files) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 files allowed per batch")
        
        files_data = []
        for file in files:
            if not file.content_type or not file.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="All files must be images")
            
            file_content = await file.read()
            files_data.append((file_content, file.filename or f"image_{uuid.uuid4()}.jpg"))
        
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
        
    except Exception as e:
        logger.error(f"Error queuing batch background removal job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch-status/{batch_id}", response_model=BatchJobStatusResponse)
async def get_batch_job_status(batch_id: str):
    """Get batch job status"""
    try:
        batch_result = await bg_service.get_batch_job_status(batch_id)
        if not batch_result:
            raise HTTPException(status_code=404, detail="Batch job not found")
        
        return BatchJobStatusResponse(
            batch_id=batch_result.batch_id,
            status=batch_result.status,
            service_type=batch_result.service_type,
            total_files=batch_result.total_files,
            completed_files=batch_result.completed_files,
            failed_files=batch_result.failed_files,
            progress=batch_result.progress,
            results=batch_result.results,
            zip_url=batch_result.zip_url
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting batch job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch-results/{batch_id}")
async def download_batch_results(batch_id: str):
    """Download batch results as ZIP file"""
    try:
        zip_data = await bg_service.get_batch_results_zip(batch_id)
        if not zip_data:
            raise HTTPException(status_code=404, detail="Batch results not found")
        
        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=batch_results_{batch_id}.zip"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading batch results: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch-direct")
async def process_batch_direct(files: List[UploadFile] = File(...)):
    """Process multiple images directly without queueing, returning individual images"""
    try:
        # Validate files
        if len(files) > 10:
            raise HTTPException(status_code=400, detail="Maximum 10 files allowed per batch")
        
        files_data = []
        for file in files:
            if not file.content_type or not file.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail="All files must be images")
            
            file_content = await file.read()
            files_data.append((file_content, file.filename or f"image_{uuid.uuid4()}.jpg"))
        
        # Process all images
        results = await bg_service.process_batch_direct(files_data)
        
        # Create a zip file with all results
        zip_buffer = io.BytesIO()
        import zipfile
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for i, (result_data, (_, filename)) in enumerate(zip(results, files_data)):
                if result_data is not None:
                    base_name = filename.rsplit('.', 1)[0] if '.' in filename else filename
                    result_filename = f"{base_name}_processed.png"
                    zip_file.writestr(result_filename, result_data)
        
        zip_buffer.seek(0)
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=batch_processed_direct.zip"}
        )
        
    except Exception as e:
        logger.error(f"Error in batch direct processing: {e}")
        raise HTTPException(status_code=500, detail=str(e))
