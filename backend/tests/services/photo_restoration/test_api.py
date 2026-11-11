import asyncio
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from config.settings import settings
from services.photo_restoration import models
from services.photo_restoration import router as restoration_router

GRAY = (120, 120, 120)
COLOR = (200, 50, 50)


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


class FakeRestorer:
    """Brightens the whole image by 10 when it 'finds' faces"""

    def __init__(self):
        self.faces = 1
        self.strengths = []

    def restore(self, rgb, strength=1.0):
        self.strengths.append(strength)
        if not self.faces:
            return rgb, 0
        return np.clip(rgb.astype(int) + 10, 0, 255).astype(np.uint8), self.faces


class FakeColorizer:
    def __init__(self):
        self.calls = 0

    def colorize(self, rgb):
        self.calls += 1
        result = rgb.copy()
        result[..., 0] = 250
        return result


def png(color=COLOR, mode="RGB"):
    buffer = io.BytesIO()
    Image.new(mode, (64, 48), color + (128,) if mode == "RGBA" else color).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def restorer(monkeypatch):
    fake = FakeRestorer()
    monkeypatch.setattr(models, "get_restorer", lambda: fake)
    return fake


@pytest.fixture
def colorizer(monkeypatch):
    fake = FakeColorizer()
    monkeypatch.setattr(models, "get_colorizer", lambda: fake)
    return fake


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = restoration_router.photo_restoration_service
    monkeypatch.setattr(service, "queue_manager", fake)
    monkeypatch.setattr(service, "_initialized", True)
    return fake


@pytest.fixture
def client(queue):
    return TestClient(main.app)


def run_worker(queue):
    for job in queue.jobs:
        try:
            asyncio.run(restoration_router.photo_restoration_service.process_job(job))
        except Exception:
            pass  # failures are recorded on the job, as in the real worker


def submit(client, image=None, **data):
    files = {"file": ("photo.png", image or png(), "image/png")}
    return client.post("/api/v1/photo-restoration/process", files=files, data={k: str(v) for k, v in data.items()})


def status(client, job_id):
    return client.get(f"/api/v1/photo-restoration/status/{job_id}").json()


def result(client, job_id):
    assert status(client, job_id)["status"] == "completed", status(client, job_id)
    response = client.get(f"/api/v1/photo-restoration/result/{job_id}")
    return np.array(Image.open(io.BytesIO(response.content)))


def test_black_and_white_photos_are_colorized_and_faces_restored(client, queue, restorer, colorizer):
    job_id = submit(client, image=png(GRAY)).json()["job_id"]
    run_worker(queue)
    assert colorizer.calls == 1
    assert tuple(result(client, job_id)[0, 0]) == (255, 130, 130)


def test_colour_photos_are_left_in_colour_by_default(client, queue, restorer, colorizer):
    job_id = submit(client).json()["job_id"]
    run_worker(queue)
    assert colorizer.calls == 0
    assert tuple(result(client, job_id)[0, 0]) == (210, 60, 60)


def test_colorize_can_be_forced_and_faces_skipped(client, queue, restorer, colorizer):
    job_id = submit(client, colorize="yes", faces="false").json()["job_id"]
    run_worker(queue)
    assert colorizer.calls == 1 and restorer.strengths == []
    assert tuple(result(client, job_id)[0, 0]) == (250, 50, 50)


def test_strength_reaches_the_restorer(client, queue, restorer, colorizer):
    submit(client, strength=0.5)
    run_worker(queue)
    assert restorer.strengths == [0.5]


def test_nothing_to_do_fails_the_job(client, queue, restorer, colorizer):
    restorer.faces = 0
    job_id = submit(client).json()["job_id"]
    run_worker(queue)
    job = status(client, job_id)
    assert job["status"] == "failed"
    assert "No faces found" in job["error_message"]


def test_transparency_is_kept(client, queue, restorer, colorizer):
    job_id = submit(client, image=png(mode="RGBA")).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape == (48, 64, 4) and pixels[0, 0, 3] == 128


@pytest.mark.parametrize(
    "data, message",
    [
        ({"colorize": "maybe"}, "colorize must be one of"),
        ({"colorize": "no", "faces": "false"}, "Choose to restore faces"),
        ({"strength": 2}, "strength must be between"),
    ],
)
def test_bad_settings_are_refused(client, data, message):
    response = submit(client, **data)
    assert response.status_code == 400
    assert message in response.json()["detail"]


def test_too_large_images_are_refused(client, monkeypatch):
    monkeypatch.setattr(settings, "restore_max_input_pixels", 100)
    assert submit(client).status_code == 400


def test_grayscale_check():
    gray = np.full((50, 50, 3), 128, np.uint8)
    sepia = np.zeros((50, 50, 3), np.uint8)
    sepia[...] = np.linspace(40, 220, 50)[:, None, None] * np.array([1.0, 0.85, 0.65])
    colour = np.zeros((50, 50, 3), np.uint8)
    colour[:25] = (200, 40, 40)
    colour[25:] = (40, 60, 200)
    assert models.is_grayscale(gray)
    assert models.is_grayscale(sepia.astype(np.uint8))
    assert not models.is_grayscale(colour)
