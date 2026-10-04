import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.sky_replacement import router as sky_router
from services.sky_replacement.presets import PRESETS, render_preset
from services.sky_replacement.processor import fit_sky


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


class FakeSegmenter:
    """Treats the top `sky_rows` rows as sky"""

    def __init__(self, sky_rows):
        self.sky_rows = sky_rows

    def sky_probability(self, image):
        probability = np.zeros(image.shape[:2], dtype=np.float32)
        probability[: self.sky_rows] = 1.0
        return probability


def landscape(width=40, height=30):
    """Grey sky over a green field"""
    pixels = np.zeros((height, width, 3), dtype=np.uint8)
    pixels[: height // 2] = (128, 128, 128)
    pixels[height // 2:] = (30, 120, 30)
    buffer = io.BytesIO()
    Image.fromarray(pixels).save(buffer, format="PNG")
    return buffer.getvalue()


def solid(color, size=(20, 10)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = sky_router.sky_service
    monkeypatch.setattr(service, "queue_manager", fake)
    monkeypatch.setattr(service, "_initialized", True)
    monkeypatch.setattr(service.processor, "segmenter", FakeSegmenter(sky_rows=15))
    return fake


@pytest.fixture
def client(queue):
    return TestClient(main.app)


def run_worker(queue):
    import asyncio

    for job in queue.jobs:
        try:
            asyncio.run(sky_router.sky_service.process_job(job))
        except Exception:
            pass  # failures are recorded on the job, as in the real worker


def result_pixels(client, job_id):
    response = client.get(f"/api/v1/sky-replacement/result/{job_id}")
    assert response.status_code == 200
    return np.array(Image.open(io.BytesIO(response.content)).convert("RGB"))


def test_presets_render():
    for name in PRESETS:
        sky = render_preset(name)
        assert sky.dtype == np.uint8 and sky.shape[2] == 3


def test_fit_sky_covers_frame():
    fitted = fit_sky(np.zeros((100, 50, 3), dtype=np.uint8), width=80, height=60, horizon=30)
    assert fitted.shape == (60, 80, 3)


def test_uploaded_sky_replaces_sky_only(client, queue):
    job_id = client.post(
        "/api/v1/sky-replacement/process",
        files={
            "file": ("field.png", landscape(), "image/png"),
            "sky": ("sky.png", solid((0, 0, 255)), "image/png"),
        },
    ).json()["job_id"]

    run_worker(queue)

    assert client.get(f"/api/v1/sky-replacement/status/{job_id}").json()["status"] == "completed"
    pixels = result_pixels(client, job_id).astype(int)
    assert pixels.shape[:2] == (30, 40)
    top, bottom = pixels[2, 20], pixels[-2, 20]
    assert top[2] > 200 and top[0] < 40  # sky is now blue
    assert bottom[1] > bottom[0] and bottom[1] > bottom[2]  # field still green


def test_preset_sky(client, queue):
    job_id = client.post(
        "/api/v1/sky-replacement/process",
        files={"file": ("field.png", landscape(), "image/png")},
        data={"sky_preset": "sunset"},
    ).json()["job_id"]

    run_worker(queue)

    assert client.get(f"/api/v1/sky-replacement/status/{job_id}").json()["status"] == "completed"


def test_photo_without_sky_fails_with_message(client, queue, monkeypatch):
    monkeypatch.setattr(sky_router.sky_service.processor, "segmenter", FakeSegmenter(sky_rows=0))
    job_id = client.post(
        "/api/v1/sky-replacement/process",
        files={"file": ("room.png", landscape(), "image/png")},
    ).json()["job_id"]

    run_worker(queue)

    status = client.get(f"/api/v1/sky-replacement/status/{job_id}").json()
    assert status["status"] == "failed"
    assert "No sky" in status["error_message"]


def test_rejects_unknown_preset(client):
    response = client.post(
        "/api/v1/sky-replacement/process",
        files={"file": ("field.png", landscape(), "image/png")},
        data={"sky_preset": "aurora"},
    )

    assert response.status_code == 400


def test_lists_presets(client):
    assert client.get("/api/v1/sky-replacement/presets").json()["data"]["presets"] == list(PRESETS)
