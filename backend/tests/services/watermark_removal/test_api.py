import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.watermark_removal import models
from services.watermark_removal import router as watermark_router
from services.watermark_removal import service as watermark_service
from services.watermark_removal.detector import mask_from_boxes
from services.watermark_removal.processor import load_mask, regions

FILL = (0, 255, 0)
BOX = [[10.0, 10.0], [30.0, 10.0], [30.0, 20.0], [10.0, 20.0]]


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


class FakeInpainter:
    """Paints the holes green, remembering the sizes it was given"""

    def __init__(self):
        self.sizes = []

    def inpaint(self, rgb, mask):
        self.sizes.append(mask.shape)
        result = rgb.copy()
        result[mask > 0] = FILL
        return result


def png(width=80, height=60, mode="RGB", color=(200, 50, 50)):
    buffer = io.BytesIO()
    Image.new(mode, (width, height), color + (128,) if mode == "RGBA" else color).save(buffer, format="PNG")
    return buffer.getvalue()


def mask_png(width=80, height=60, box=(10, 10, 30, 20), transparent=False):
    """White box on black, or opaque strokes on a transparent layer"""
    mode, background, ink = ("RGBA", (0, 0, 0, 0), (255, 0, 0, 255)) if transparent else ("L", 0, 255)
    image = Image.new(mode, (width, height), background)
    image.paste(ink, box)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def model(monkeypatch):
    fake = FakeInpainter()
    monkeypatch.setattr(models, "get_model", lambda: fake)
    monkeypatch.setattr(models, "on_gpu", lambda: True)
    return fake


@pytest.fixture
def found(monkeypatch):
    """Swaps the text detector for one that finds BOX (or what the test sets)"""
    boxes = [BOX]
    fake = lambda image: list(boxes)
    monkeypatch.setattr(watermark_service, "detect_text", fake)
    monkeypatch.setattr(watermark_router, "detect_text", fake)
    return boxes


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = watermark_router.watermark_removal_service
    monkeypatch.setattr(service, "queue_manager", fake)
    monkeypatch.setattr(service, "_initialized", True)
    return fake


@pytest.fixture
def client(queue):
    return TestClient(main.app)


def run_worker(queue):
    import asyncio

    for job in queue.jobs:
        try:
            asyncio.run(watermark_router.watermark_removal_service.process_job(job))
        except Exception:
            pass  # failures are recorded on the job, as in the real worker


def submit(client, image=None, mask=None):
    files = {"file": ("photo.png", image or png(), "image/png")}
    if mask is not None:
        files["mask"] = ("mask.png", mask, "image/png")
    return client.post("/api/v1/watermark-removal/process", files=files)


def status(client, job_id):
    return client.get(f"/api/v1/watermark-removal/status/{job_id}").json()


def result(client, job_id):
    assert status(client, job_id)["status"] == "completed"
    response = client.get(f"/api/v1/watermark-removal/result/{job_id}")
    assert response.status_code == 200
    return np.array(Image.open(io.BytesIO(response.content)))


def test_load_mask_reads_black_and_white_and_transparent_masks():
    for transparent in (False, True):
        mask = load_mask(mask_png(transparent=transparent), (80, 60))
        assert mask[15, 20] and not mask[40, 60]
        assert mask.sum() == 20 * 10


def test_load_mask_stretches_to_the_image():
    mask = load_mask(mask_png(40, 30, (5, 5, 15, 10)), (80, 60))
    assert mask.shape == (60, 80)
    assert mask[15, 20] and not mask[40, 60]


def test_regions_group_nearby_marks_and_add_context():
    mask = np.zeros((1000, 1000), bool)
    mask[100:110, 100:110] = True
    mask[100:110, 150:160] = True  # close: same crop
    mask[800:810, 800:810] = True  # far: its own crop
    crops = sorted(regions(mask, context=20))
    assert crops == [(80, 80, 180, 130), (780, 780, 830, 830)]


def test_masked_area_is_filled_and_the_rest_kept(client, queue, model):
    job_id = submit(client, mask=mask_png()).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert tuple(pixels[15, 20]) == FILL
    assert tuple(pixels[50, 70]) == (200, 50, 50)


def test_without_a_mask_the_text_is_found(client, queue, model, found):
    job_id = submit(client).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert tuple(pixels[15, 20]) == FILL
    assert tuple(pixels[50, 70]) == (200, 50, 50)


def test_no_text_found_fails_the_job(client, queue, model, found):
    found.clear()
    job_id = submit(client).json()["job_id"]
    run_worker(queue)
    job = status(client, job_id)
    assert job["status"] == "failed"
    assert "No watermark" in job["error_message"]


def test_empty_mask_fails_the_job(client, queue, model):
    job_id = submit(client, mask=mask_png(box=(0, 0, 0, 0))).json()["job_id"]
    run_worker(queue)
    job = status(client, job_id)
    assert job["status"] == "failed"
    assert "empty" in job["error_message"]


def test_transparency_is_kept(client, queue, model):
    job_id = submit(client, png(mode="RGBA"), mask_png()).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape[2] == 4
    assert pixels[50, 70, 3] == 128


def test_big_regions_are_shrunk_for_the_model(client, queue, model, monkeypatch):
    monkeypatch.setattr("config.settings.settings.watermark_max_side_gpu", 100)
    job_id = submit(client, png(400, 300), mask_png(400, 300, (0, 0, 400, 300))).json()["job_id"]
    run_worker(queue)
    assert result(client, job_id).shape[:2] == (300, 400)
    assert model.sizes == [(75, 100)]


def test_detect_returns_boxes(client, found):
    response = client.post(
        "/api/v1/watermark-removal/detect", files={"file": ("photo.png", png(), "image/png")}
    )
    assert response.status_code == 200
    assert response.json() == {"width": 80, "height": 60, "boxes": [BOX]}


def test_huge_images_are_refused_before_queuing(client, queue, monkeypatch):
    monkeypatch.setattr("config.settings.settings.watermark_max_input_pixels", 100)
    response = submit(client, mask=mask_png())
    assert response.status_code == 400
    assert "too large" in response.json()["detail"]
    assert queue.jobs == []


def test_batch_shares_one_mask(client, queue, model):
    files = [("files", (f"{i}.png", png(), "image/png")) for i in range(2)]
    files.append(("mask", ("mask.png", mask_png(), "image/png")))
    response = client.post("/api/v1/watermark-removal/process-batch", files=files)
    assert response.status_code == 200
    run_worker(queue)
    for job_id in response.json()["job_ids"]:
        assert tuple(result(client, job_id)[15, 20]) == FILL


def test_mask_from_boxes():
    mask = np.array(Image.open(io.BytesIO(mask_from_boxes((80, 60), [BOX]))))
    assert mask[15, 20] == 255 and mask[40, 60] == 0
