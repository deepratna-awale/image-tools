import io
import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from config.settings import settings
from core.animation import image_mime_type
from core.job_service import ImageJobService
from core.models.responses import APIResponse, BatchJobStatusResponse, JobStatusResponse

logger = logging.getLogger(__name__)

MAX_BATCH_FILES = 10


def _check_size(content: bytes, filename: Optional[str]) -> None:
    if len(content) > settings.max_file_size:
        limit_mb = settings.max_file_size / (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"{filename or 'File'} exceeds the {limit_mb:.0f}MB limit")


async def read_image(file: UploadFile) -> tuple[bytes, str]:
    """Validate an uploaded image and return its bytes and a filename"""
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    content = await file.read()
    _check_size(content, file.filename)
    return content, file.filename or f"image_{uuid.uuid4()}.jpg"


async def read_images(files: List[UploadFile]) -> List[tuple[bytes, str]]:
    """Validate a batch of uploaded images"""
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_BATCH_FILES} files allowed per batch")
    files_data = []
    for file in files:
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="All files must be images")
        files_data.append(await read_image(file))
    return files_data


def add_job_routes(router: APIRouter, service: ImageJobService) -> None:
    """Add the status, result, stats and batch download routes every tool shares"""

    @router.get("/status/{job_id}", response_model=JobStatusResponse)
    async def get_job_status(job_id: str):
        """Get job status"""
        try:
            job_result = await service.get_job_status(job_id)
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
            result_data = await service.get_job_result(job_id)
            if not result_data:
                raise HTTPException(status_code=404, detail="Result not found")

            # Animations come back as WebP, everything else as PNG
            media_type = image_mime_type(result_data)
            extension = media_type.split("/")[1].replace("jpeg", "jpg")
            return StreamingResponse(
                io.BytesIO(result_data),
                media_type=media_type,
                headers={"Content-Disposition": f"attachment; filename=processed_{job_id}.{extension}"}
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting job result: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/stats")
    async def get_service_stats():
        """Get service statistics"""
        try:
            stats = await service.get_stats()
            return APIResponse(
                success=True,
                message="Stats retrieved successfully",
                data=stats
            )
        except Exception as e:
            logger.error(f"Error getting service stats: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/batch-status/{batch_id}", response_model=BatchJobStatusResponse)
    async def get_batch_job_status(batch_id: str):
        """Get batch job status"""
        try:
            batch_result = await service.get_batch_job_status(batch_id)
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
            zip_data = await service.get_batch_results_zip(batch_id)
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
