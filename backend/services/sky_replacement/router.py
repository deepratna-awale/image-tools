from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Any, Dict, List, Optional
import logging

from core.job_router import add_job_routes, read_image, read_images
from core.models.responses import APIResponse, JobSubmissionResponse, BatchJobSubmissionResponse
from .presets import PRESETS
from .processor import DEFAULT_PRESET
from .service import SkyReplacementService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sky-replacement", tags=["Sky Replacement"])

# Initialize service
sky_service = SkyReplacementService()


async def _sky_inputs(
    sky: Optional[UploadFile], sky_preset: Optional[str]
) -> tuple[Dict[str, Any], Dict[str, tuple[bytes, str]]]:
    """An uploaded sky wins over a preset"""
    if sky is not None and sky.filename:
        return {}, {"sky": await read_image(sky)}
    preset = sky_preset or DEFAULT_PRESET
    if preset not in PRESETS:
        raise HTTPException(status_code=400, detail=f"sky_preset must be one of: {', '.join(PRESETS)}")
    return {"sky_preset": preset}, {}


@router.get("/presets", response_model=APIResponse)
async def list_presets():
    """List the built-in skies"""
    return APIResponse(success=True, message="Sky presets", data={"presets": list(PRESETS)})


@router.post("/process", response_model=JobSubmissionResponse)
async def queue_sky_replacement(
    file: UploadFile = File(...),
    sky: Optional[UploadFile] = File(None),
    sky_preset: Optional[str] = Form(None),
):
    """Queue sky replacement job"""
    try:
        file_content, filename = await read_image(file)
        parameters, assets = await _sky_inputs(sky, sky_preset)

        job = await sky_service.submit_job(file_content, filename, parameters, assets)

        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            message="Sky replacement job queued successfully",
            service_type=job.service_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing sky replacement job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-batch", response_model=BatchJobSubmissionResponse)
async def queue_batch_sky_replacement(
    files: List[UploadFile] = File(...),
    sky: Optional[UploadFile] = File(None),
    sky_preset: Optional[str] = Form(None),
):
    """Queue batch sky replacement job; every image gets the same sky"""
    try:
        files_data = await read_images(files)
        parameters, assets = await _sky_inputs(sky, sky_preset)

        batch_job = await sky_service.submit_batch_job(files_data, parameters, assets)

        return BatchJobSubmissionResponse(
            batch_id=batch_job.batch_id,
            status=batch_job.status,
            message=f"Batch sky replacement job queued successfully with {len(files)} files",
            service_type=batch_job.service_type,
            total_files=batch_job.total_files,
            job_ids=[job.job_id for job in batch_job.jobs]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error queuing batch sky replacement job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


add_job_routes(router, sky_service)
