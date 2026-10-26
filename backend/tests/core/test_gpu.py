import base64
import json

import httpx
import pytest

import gpu_handler
from config.settings import settings
from core import gpu
from core.gpu import GpuProcessor, decode_arguments, encode_arguments


class LocalProcessor:
    def __init__(self):
        self.calls = []

    async def process(self, image_data: bytes, **arguments) -> bytes:
        self.calls.append(arguments)
        return b"cpu:" + image_data


@pytest.fixture(autouse=True)
def endpoint(monkeypatch):
    monkeypatch.setattr(settings, "runpod_api_key", "test-key")
    monkeypatch.setattr(settings, "runpod_endpoint_id", "endpoint123")
    monkeypatch.setattr(settings, "gpu_fallback_to_cpu", True)
    monkeypatch.setattr(gpu, "POLL_INTERVAL_SECONDS", 0)


def completed(image: bytes, job_id="job1"):
    return {"id": job_id, "status": "COMPLETED", "output": {"image": base64.b64encode(image).decode()}}


def test_arguments_round_trip_bytes():
    arguments = {"background": b"\x00\xffpng", "background_color": "#ffffff", "cloak": True}

    encoded = encode_arguments(arguments)

    json.dumps(encoded)  # must be JSON-safe
    assert decode_arguments(encoded) == arguments


async def test_sends_image_and_arguments_to_runsync():
    seen = []

    def respond(request: httpx.Request):
        seen.append(request)
        return httpx.Response(200, json=completed(b"gpu-result"))

    processor = GpuProcessor("background_changing", LocalProcessor(), httpx.MockTransport(respond))
    result = await processor.process(b"photo", background=b"bg", background_color="#000000")

    assert result == b"gpu-result"
    request = seen[0]
    assert request.url == "https://api.runpod.ai/v2/endpoint123/runsync"
    assert request.headers["Authorization"] == "Bearer test-key"
    body = json.loads(request.content)["input"]
    assert body["service"] == "background_changing"
    assert base64.b64decode(body["image"]) == b"photo"
    assert decode_arguments(body["arguments"]) == {"background": b"bg", "background_color": "#000000"}


async def test_polls_until_a_slow_job_finishes():
    statuses = iter([{"id": "job1", "status": "IN_PROGRESS"}, completed(b"done")])

    def respond(request: httpx.Request):
        if request.url.path.endswith("/runsync"):
            return httpx.Response(200, json={"id": "job1", "status": "IN_QUEUE"})
        assert request.url.path == "/v2/endpoint123/status/job1"
        return httpx.Response(200, json=next(statuses))

    processor = GpuProcessor("ai_shield", LocalProcessor(), httpx.MockTransport(respond))

    assert await processor.process(b"photo") == b"done"


async def test_falls_back_to_cpu_when_the_gpu_job_fails():
    local = LocalProcessor()

    def respond(request: httpx.Request):
        return httpx.Response(200, json={"id": "job1", "status": "FAILED", "error": "CUDA out of memory"})

    processor = GpuProcessor("sky_replacement", local, httpx.MockTransport(respond))

    assert await processor.process(b"photo", preset="sunset") == b"cpu:photo"
    assert local.calls == [{"preset": "sunset"}]


async def test_times_out_and_cancels(monkeypatch):
    monkeypatch.setattr(settings, "gpu_timeout_seconds", 0)
    cancelled = []

    def respond(request: httpx.Request):
        if "/cancel/" in request.url.path:
            cancelled.append(request.url.path)
        return httpx.Response(200, json={"id": "job1", "status": "IN_QUEUE"})

    processor = GpuProcessor("background_removal", LocalProcessor(), httpx.MockTransport(respond))

    assert await processor.process(b"photo") == b"cpu:photo"
    assert cancelled == ["/v2/endpoint123/cancel/job1"]


async def test_raises_without_fallback(monkeypatch):
    monkeypatch.setattr(settings, "gpu_fallback_to_cpu", False)
    processor = GpuProcessor(
        "background_removal", LocalProcessor(), httpx.MockTransport(lambda r: httpx.Response(500))
    )

    with pytest.raises(httpx.HTTPStatusError):
        await processor.process(b"photo")


async def test_handler_runs_the_named_processor(monkeypatch):
    local = LocalProcessor()
    monkeypatch.setitem(gpu_handler.PROCESSORS, "background_changing", local)
    job = {
        "input": {
            "service": "background_changing",
            "image": base64.b64encode(b"photo").decode(),
            "arguments": encode_arguments({"background": b"bg"}),
        }
    }

    output = await gpu_handler.handler(job)

    assert base64.b64decode(output["image"]) == b"cpu:photo"
    assert local.calls == [{"background": b"bg"}]


async def test_handler_reports_unknown_services():
    output = await gpu_handler.handler({"input": {"service": "nope", "image": ""}})

    assert "error" in output
