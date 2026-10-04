import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.background_changing import processor as changing_processor
from services.background_changing import router as changing_router
from services.background_changing.processor import BackgroundChangingProcessor, parse_hex_color


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


def png(color, size=(8, 6)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def fake_remove(image, session=None):
    """Keep the left half as the subject and make the right half transparent"""
    rgba = np.array(image.convert("RGBA"))
    rgba[:, rgba.shape[1] // 2:, 3] = 0
    return Image.fromarray(rgba)


@pytest.fixture(autouse=True)
def no_model(monkeypatch):
    monkeypatch.setattr(changing_processor, "remove", fake_remove)
    monkeypatch.setattr(changing_processor, "get_rembg_session", lambda name: None)


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = changing_router.bg_changing_service
    monkeypatch.setattr(service, "queue_manager", fake)
    monkeypatch.setattr(service, "_initialized", True)
    return fake


@pytest.fixture
def client(queue):
    return TestClient(main.app)


def run_worker(queue):
    import asyncio

    for job in queue.jobs:
        asyncio.run(changing_router.bg_changing_service.process_job(job))


def result_pixels(client, job_id):
    response = client.get(f"/api/v1/background-changing/result/{job_id}")
    assert response.status_code == 200
    return np.array(Image.open(io.BytesIO(response.content)).convert("RGB"))


def test_parse_hex_color():
    assert parse_hex_color("#1e90ff") == (30, 144, 255)
    assert parse_hex_color("FFFFFF") == (255, 255, 255)
    with pytest.raises(ValueError):
        parse_hex_color("blue")


def test_color_background(client, queue):
    job_id = client.post(
        "/api/v1/background-changing/process",
        files={"file": ("photo.png", png((200, 0, 0)), "image/png")},
        data={"background_color": "#00ff00"},
    ).json()["job_id"]

    run_worker(queue)

    assert client.get(f"/api/v1/background-changing/status/{job_id}").json()["status"] == "completed"
    pixels = result_pixels(client, job_id)
    assert tuple(pixels[0, 0]) == (200, 0, 0)  # subject kept
    assert tuple(pixels[0, -1]) == (0, 255, 0)  # background replaced


def test_image_background_is_resized_to_photo(client, queue):
    job_id = client.post(
        "/api/v1/background-changing/process",
        files={
            "file": ("photo.png", png((200, 0, 0)), "image/png"),
            "background": ("beach.png", png((0, 0, 255), size=(40, 10)), "image/png"),
        },
    ).json()["job_id"]

    run_worker(queue)

    pixels = result_pixels(client, job_id)
    assert pixels.shape[:2] == (6, 8)
    assert tuple(pixels[0, -1]) == (0, 0, 255)


def test_defaults_to_white(client, queue):
    job_id = client.post(
        "/api/v1/background-changing/process",
        files={"file": ("photo.png", png((200, 0, 0)), "image/png")},
    ).json()["job_id"]

    run_worker(queue)

    assert tuple(result_pixels(client, job_id)[0, -1]) == (255, 255, 255)


def test_batch_shares_background(client, queue):
    files = [("files", (f"img{i}.png", png((200, 0, 0)), "image/png")) for i in range(2)]
    batch = client.post(
        "/api/v1/background-changing/process-batch",
        files=files + [("background", ("bg.png", png((0, 0, 255)), "image/png"))],
    ).json()

    run_worker(queue)

    status = client.get(f"/api/v1/background-changing/batch-status/{batch['batch_id']}").json()
    assert status["completed_files"] == 2
    for job_id in batch["job_ids"]:
        assert tuple(result_pixels(client, job_id)[0, -1]) == (0, 0, 255)


def test_rejects_bad_color(client):
    response = client.post(
        "/api/v1/background-changing/process",
        files={"file": ("photo.png", png((200, 0, 0)), "image/png")},
        data={"background_color": "not-a-color"},
    )

    assert response.status_code == 400


def test_rejects_non_image_background(client):
    response = client.post(
        "/api/v1/background-changing/process",
        files={
            "file": ("photo.png", png((200, 0, 0)), "image/png"),
            "background": ("notes.txt", b"hello", "text/plain"),
        },
    )

    assert response.status_code == 400
