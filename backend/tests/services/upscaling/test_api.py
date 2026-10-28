import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.upscaling import models
from services.upscaling import router as upscaling_router
from services.upscaling.processor import plan_size


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


class FakeUpscaler:
    """Nearest-neighbour 4x, remembering which model was asked for"""

    def __init__(self, name, used):
        self.name, self.used = name, used

    def upscale(self, rgb):
        self.used.append(self.name)
        return rgb.repeat(4, axis=0).repeat(4, axis=1)


class FakeStyle:
    def __init__(self, anime):
        self.anime = anime

    def anime_probability(self, rgb):
        return self.anime


class UsedModels(list):
    """Models the fakes were asked for, in order, plus the fakes themselves"""

    fakes: dict


def png(width=40, height=30, mode="RGB"):
    buffer = io.BytesIO()
    image = Image.new(mode, (width, height), (200, 50, 50, 128) if mode == "RGBA" else (200, 50, 50))
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def used(monkeypatch):
    """Swaps the real models for fakes; the style check calls everything anime"""
    used = UsedModels()
    fakes = {"style": FakeStyle(0.9), "photo": FakeUpscaler("photo", used), "anime": FakeUpscaler("anime", used)}
    monkeypatch.setattr(models, "get_model", lambda name: fakes[name])
    monkeypatch.setattr(models, "on_gpu", lambda: True)
    used.fakes = fakes
    return used


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = upscaling_router.upscaling_service
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
            asyncio.run(upscaling_router.upscaling_service.process_job(job))
        except Exception:
            pass  # failures are recorded on the job, as in the real worker


def submit(client, data, image=None):
    return client.post(
        "/api/v1/upscaling/process",
        files={"file": ("art.png", image or png(), "image/png")},
        data=data,
    )


def result(client, job_id):
    assert client.get(f"/api/v1/upscaling/status/{job_id}").json()["status"] == "completed"
    response = client.get(f"/api/v1/upscaling/result/{job_id}")
    assert response.status_code == 200
    return Image.open(io.BytesIO(response.content))


def test_plan_scale():
    assert plan_size(100, 50, scale=1.5) == (150, 75, 150, 75)
    assert plan_size(100, 50) == (200, 100, 200, 100)


def test_plan_target_covers_then_crops():
    # 100x50 must grow 3x to cover 300x100 in both directions, then 50 px of height is cropped
    assert plan_size(100, 50, target_width=300, target_height=100) == (300, 150, 300, 100)
    # One side given: the other follows the shape
    assert plan_size(100, 50, target_width=250) == (250, 125, 250, 125)


@pytest.mark.parametrize(
    "kwargs, message",
    [
        ({"scale": 5}, "between 1 and 4"),
        ({"scale": 0.5}, "between 1 and 4"),
        ({"target_width": 500}, "the most is 4x"),
        ({"target_width": 50, "target_height": 20}, "already larger"),
    ],
)
def test_plan_rejects(kwargs, message):
    with pytest.raises(ValueError, match=message):
        plan_size(100, 50, **kwargs)


def test_plan_rejects_huge_results():
    with pytest.raises(ValueError, match="megapixels"):
        plan_size(3000, 3000, scale=2)


def test_scale_upscales_with_detected_model(client, queue, used):
    job_id = submit(client, {"scale": "1.5"}).json()["job_id"]
    run_worker(queue)
    assert result(client, job_id).size == (60, 45)
    assert used == ["anime"]


def test_target_size_is_exact(client, queue, used):
    job_id = submit(client, {"width": "120", "height": "120", "style": "photo"}).json()["job_id"]
    run_worker(queue)
    assert result(client, job_id).size == (120, 120)
    assert used == ["photo"]


def test_photos_get_the_photo_model(client, queue, used):
    used.fakes["style"].anime = 0.1
    job_id = submit(client, {}).json()["job_id"]
    run_worker(queue)
    assert result(client, job_id).size == (80, 60)
    assert used == ["photo"]


def test_transparency_is_kept(client, queue, used):
    job_id = submit(client, {"scale": "2"}, png(mode="RGBA")).json()["job_id"]
    run_worker(queue)
    image = result(client, job_id)
    assert image.mode == "RGBA"
    assert np.array(image)[10, 10, 3] == 128


@pytest.mark.parametrize(
    "data, message",
    [
        ({"scale": "6"}, "between 1 and 4"),
        ({"width": "1000"}, "the most is 4x"),
        ({"style": "oil painting"}, "style must be one of"),
        ({"width": "-5"}, "positive"),
    ],
)
def test_bad_requests_are_refused_before_queuing(client, queue, data, message):
    response = submit(client, data)
    assert response.status_code == 400
    assert message in response.json()["detail"]
    assert queue.jobs == []


def test_large_images_are_refused_on_cpu(client, queue, used, monkeypatch):
    monkeypatch.setattr(models, "on_gpu", lambda: False)
    monkeypatch.setattr("config.settings.settings.upscale_cpu_max_input_pixels", 100)
    job_id = submit(client, {"scale": "2"}).json()["job_id"]
    run_worker(queue)
    status = client.get(f"/api/v1/upscaling/status/{job_id}").json()
    assert status["status"] == "failed"
    assert "too large" in status["error_message"]
