import asyncio
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from config.settings import settings
from services.object_removal import models
from services.object_removal import router as eraser_router

FILL = (0, 255, 0)
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


class FakeEraser:
    """Paints the holes green, remembering the sizes it was given"""

    def __init__(self):
        self.sizes = []

    def fill(self, rgb, holes):
        self.sizes.append(rgb.shape[:2])
        result = rgb.copy()
        result[holes] = FILL
        return result


def png(width=80, height=60, mode="RGB"):
    buffer = io.BytesIO()
    Image.new(mode, (width, height), COLOR + (128,) if mode == "RGBA" else COLOR).save(buffer, format="PNG")
    return buffer.getvalue()


def mask_png(width=80, height=60, box=(30, 20, 50, 40)):
    image = Image.new("L", (width, height), 0)
    if box:
        image.paste(255, box)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def eraser(monkeypatch):
    fake = FakeEraser()
    monkeypatch.setattr(models, "get_eraser", lambda: fake)
    return fake


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = eraser_router.object_removal_service
    monkeypatch.setattr(service, "queue_manager", fake)
    monkeypatch.setattr(service, "_initialized", True)
    return fake


@pytest.fixture
def client(queue):
    return TestClient(main.app)


def run_worker(queue):
    for job in queue.jobs:
        try:
            asyncio.run(eraser_router.object_removal_service.process_job(job))
        except Exception:
            pass  # failures are recorded on the job, as in the real worker


def submit(client, image=None, mask=None):
    files = {"file": ("photo.png", image or png(), "image/png")}
    if mask is not None:
        files["mask"] = ("mask.png", mask, "image/png")
    return client.post("/api/v1/object-removal/process", files=files)


def status(client, job_id):
    return client.get(f"/api/v1/object-removal/status/{job_id}").json()


def result(client, job_id):
    assert status(client, job_id)["status"] == "completed"
    response = client.get(f"/api/v1/object-removal/result/{job_id}")
    assert response.status_code == 200
    return np.array(Image.open(io.BytesIO(response.content)))


def test_painted_area_is_filled_and_the_rest_kept(client, queue, eraser):
    job_id = submit(client, mask=mask_png()).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert tuple(pixels[30, 40]) == FILL
    # The mask grows a few pixels, then blends out; far away nothing changes
    assert tuple(pixels[5, 5]) == COLOR
    assert pixels.shape == (60, 80, 3)


def test_transparency_is_kept(client, queue, eraser):
    job_id = submit(client, image=png(mode="RGBA"), mask=mask_png()).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape == (60, 80, 4)
    assert pixels[5, 5, 3] == 128


def test_big_areas_are_filled_smaller(client, queue, eraser, monkeypatch):
    monkeypatch.setattr(settings, "eraser_work_size", 40)
    job_id = submit(client, mask=mask_png()).json()["job_id"]
    run_worker(queue)
    assert max(eraser.sizes[0]) <= 40
    assert tuple(result(client, job_id)[30, 40]) == FILL


def test_an_empty_mask_fails_the_job(client, queue, eraser):
    job_id = submit(client, mask=mask_png(box=None)).json()["job_id"]
    run_worker(queue)
    job = status(client, job_id)
    assert job["status"] == "failed"
    assert "empty" in job["error_message"]


def test_a_mask_is_required(client):
    assert submit(client).status_code == 422


def test_too_large_images_are_refused(client, monkeypatch):
    monkeypatch.setattr(settings, "eraser_max_input_pixels", 100)
    response = submit(client, mask=mask_png())
    assert response.status_code == 400
    assert "too large" in response.json()["detail"]


def test_it_never_goes_to_the_gpu(monkeypatch):
    from workers import image_processor
    from core.models.job import ServiceType

    monkeypatch.setattr(settings, "runpod_api_key", "key")
    monkeypatch.setattr(settings, "runpod_endpoint_id", "endpoint")
    worker = image_processor.ImageProcessorWorker()
    assert type(worker.services[ServiceType.OBJECT_REMOVAL].processor).__name__ == "ObjectRemovalProcessor"
    assert type(worker.services[ServiceType.UPSCALING].processor).__name__ == "GpuProcessor"
