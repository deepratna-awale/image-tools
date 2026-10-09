from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from PIL import UnidentifiedImageError
import logging

from core.job_router import read_image
from .reader import read_metadata

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/metadata-reading", tags=["Metadata Reading"])


@router.post("/read")
async def read_image_metadata(file: UploadFile = File(...)):
    """Read the Stable Diffusion prompt and generation settings stored in an image"""
    content, filename = await read_image(file)
    try:
        return await run_in_threadpool(read_metadata, content)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail=f"{filename} could not be opened as an image")
    except Exception as e:
        logger.error(f"Error reading metadata from {filename}: {e}")
        raise HTTPException(status_code=500, detail="Could not read this image's metadata")
