from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Any, Dict, List, Optional
import logging

from core.job_router import add_job_routes, read_image, read_images
from core.models.responses import BatchJobSubmissionResponse, JobSubmissionResponse
from .processor import DEFAULT_STRENGTH, STRENGTH_NAMES
from .service import AIShieldService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-shield", tags=["AI Shield"])

# Initialize service
shield_service = AIShieldService()

MAX_TEXT_LENGTH = 200


def _parameters(
    strength: Optional[str],
    cloak: bool,
    metadata: bool,
    creator: Optional[str],
    copyright_notice: Optional[str],
) -> Dict[str, Any]:
    strength = strength or DEFAULT_STRENGTH
    if strength not in STRENGTH_NAMES:
        raise HTTPException(status_code=400, detail=f"strength must be one of: {', '.join(STRENGTH_NAMES)}")
    if not cloak and not metadata:
        raise HTTPException(status_code=400, detail="Choose the cloak, the do-not-train notice, or both")
    texts = {"creator": creator, "copyright_notice": copyright_notice}
    for name, value in texts.items():
        if value and len(value) > MAX_TEXT_LENGTH:
            raise HTTPException(status_code=400, detail=f"{name} must be at most {MAX_TEXT_LENGTH} characters")
    return {
        "strength": strength,
        "cloak": cloak,
        "metadata": metadata,
        **{name: value.strip() for name, value in texts.items() if value and value.strip()},
    }


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_ai_shield(
    file: UploadFile = File(...),
    strength: Optional[str] = Form(None),
    cloak: bool = Form(True),
    metadata: bool = Form(True),
    creator: Optional[str] = Form(None),
    copyright_notice: Optional[str] = Form(None),
):
    """Queue an AI Shield job"""
    try:
        parameters = _parameters(strength, cloak, metadata, creator, copyright_notice)
        file_content, filename = await read_image(file)

        job = await shield_service.submit_job(file_content, filename, parameters)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="AI Shield job queued successfully",
            service_type=job.service_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing AI Shield job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_ai_shield(
    files: List[UploadFile] = File(...),
    strength: Optional[str] = Form(None),
    cloak: bool = Form(True),
    metadata: bool = Form(True),
    creator: Optional[str] = Form(None),
    copyright_notice: Optional[str] = Form(None),
):
    """Queue AI Shield jobs for several images with the same settings"""
    try:
        parameters = _parameters(strength, cloak, metadata, creator, copyright_notice)
        files_data = await read_images(files)

        batch_job = await shield_service.submit_batch_job(files_data, parameters)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch AI Shield job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch AI Shield job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, shield_service)
