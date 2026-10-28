"""Send a tool's model work to a RunPod Serverless GPU endpoint.

The worker on the server still takes jobs off the queue, stores inputs and results
and tracks status; only the processor call (image bytes + job parameters in, image
bytes out) runs on the GPU. The endpoint runs gpu_handler.py with the same processors.
"""

import asyncio
import base64
import logging
import time
from typing import Any, Dict, Optional

import httpx

from config.settings import settings
from core.gpu_budget import budget

logger = logging.getLogger(__name__)

# Marks a bytes value (e.g. a background image) inside the JSON job arguments
BYTES_KEY = "__base64__"
POLL_INTERVAL_SECONDS = 1.0
DONE_STATUSES = ("COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT")


def encode_arguments(arguments: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: {BYTES_KEY: base64.b64encode(value).decode()} if isinstance(value, bytes) else value
        for key, value in arguments.items()
    }


def decode_arguments(arguments: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: base64.b64decode(value[BYTES_KEY]) if isinstance(value, dict) and BYTES_KEY in value else value
        for key, value in arguments.items()
    }


class GpuError(RuntimeError):
    pass


class GpuProcessor:
    """Runs a processor on the GPU endpoint, falling back to the local processor on failure"""

    # The worker may run several GPU jobs at once, but CPU fallbacks one at a time
    _cpu_slot: Optional[asyncio.Semaphore] = None

    def __init__(self, service: str, local, transport: Optional[httpx.AsyncBaseTransport] = None):
        self.service = service
        self.local = local
        self.transport = transport

    async def process(self, image_data: bytes, **arguments) -> bytes:
        if budget.exhausted():
            logger.warning(
                f"GPU budget of ${settings.gpu_monthly_budget_usd:.2f} used up this month;"
                f" running {self.service} on the CPU"
            )
            return await self._run_locally(image_data, arguments)
        started = time.monotonic()
        try:
            result = await self._run(image_data, arguments)
            logger.info(f"GPU {self.service} job took {time.monotonic() - started:.1f}s")
            return result
        except Exception as e:
            if not settings.gpu_fallback_to_cpu:
                raise
            logger.warning(f"GPU {self.service} job failed ({e}); running it on the CPU instead")
            return await self._run_locally(image_data, arguments)

    async def _run_locally(self, image_data: bytes, arguments: Dict[str, Any]) -> bytes:
        if GpuProcessor._cpu_slot is None:
            GpuProcessor._cpu_slot = asyncio.Semaphore(1)
        async with GpuProcessor._cpu_slot:
            return await self.local.process(image_data, **arguments)

    async def _run(self, image_data: bytes, arguments: Dict[str, Any]) -> bytes:
        payload = {
            "input": {
                "service": self.service,
                "image": base64.b64encode(image_data).decode(),
                "arguments": encode_arguments(arguments),
            }
        }
        base_url = f"{settings.runpod_api_url.rstrip('/')}/{settings.runpod_endpoint_id}"
        headers = {"Authorization": f"Bearer {settings.runpod_api_key}"}
        deadline = time.monotonic() + settings.gpu_timeout_seconds

        async with httpx.AsyncClient(
            base_url=base_url, headers=headers, timeout=120, transport=self.transport
        ) as client:
            started = time.monotonic()
            # runsync waits for short jobs; longer ones (cold starts, AI Shield) are polled
            response = await client.post("/runsync", json=payload)
            response.raise_for_status()
            job = response.json()
            while job.get("status") not in DONE_STATUSES:
                if time.monotonic() > deadline:
                    await client.post(f"/cancel/{job['id']}")
                    self._record_cost({}, started)
                    raise GpuError(f"timed out after {settings.gpu_timeout_seconds:.0f}s")
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                response = await client.get(f"/status/{job['id']}")
                response.raise_for_status()
                job = response.json()
            self._record_cost(job, started)

        if job["status"] != "COMPLETED":
            raise GpuError(f"{job['status']}: {job.get('error') or 'no error message'}")
        output = job.get("output") or {}
        if "error" in output:
            raise GpuError(output["error"])
        return base64.b64decode(output["image"])

    def _record_cost(self, job: Dict[str, Any], started: float) -> None:
        # RunPod reports the cold start / queue wait and run time in milliseconds
        timings = [job.get("delayTime"), job.get("executionTime")]
        if any(isinstance(value, (int, float)) for value in timings):
            seconds = sum(value for value in timings if isinstance(value, (int, float))) / 1000
        else:
            seconds = time.monotonic() - started
        total = budget.record(seconds)
        logger.info(f"GPU spend this month: ${total:.2f} of ${settings.gpu_monthly_budget_usd:.2f}")
