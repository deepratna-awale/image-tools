"""RunPod Serverless entry point: runs one tool's processor on the GPU.

Started by deployment/gpu/Dockerfile. The server's worker sends
{"service", "image", "arguments"} (see core/gpu.py) and gets {"image"} back.
"""

import base64
import logging

from core.gpu import decode_arguments
from core.models.job import ServiceType
from services.ai_shield.processor import AIShieldProcessor
from services.background_changing.processor import BackgroundChangingProcessor
from services.background_removal.processor import BackgroundRemovalProcessor
from services.sky_replacement.processor import SkyReplacementProcessor
from services.upscaling.processor import UpscalingProcessor

logger = logging.getLogger(__name__)

PROCESSORS = {
    ServiceType.BACKGROUND_REMOVAL.value: BackgroundRemovalProcessor(),
    ServiceType.BACKGROUND_CHANGING.value: BackgroundChangingProcessor(),
    ServiceType.SKY_REPLACEMENT.value: SkyReplacementProcessor(),
    ServiceType.AI_SHIELD.value: AIShieldProcessor(),
    ServiceType.UPSCALING.value: UpscalingProcessor(),
}


async def handler(job):
    request = job["input"]
    processor = PROCESSORS.get(request.get("service"))
    if processor is None:
        return {"error": f"Unknown service: {request.get('service')}"}
    try:
        result = await processor.process(
            base64.b64decode(request["image"]), **decode_arguments(request.get("arguments") or {})
        )
    except Exception as e:
        logger.exception("GPU job failed")
        return {"error": str(e)}
    return {"image": base64.b64encode(result).decode()}


if __name__ == "__main__":
    import runpod

    from services.background_removal.processor import get_rembg_session
    from config.settings import settings

    logging.basicConfig(level=logging.INFO)
    # Load the cutout model during the cold start rather than on the first job
    get_rembg_session(settings.rembg_model)
    runpod.serverless.start({"handler": handler})
