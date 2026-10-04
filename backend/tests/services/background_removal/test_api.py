import io
import zipfile

import pytest
from fastapi.testclient import TestClient

import main
from config.settings import settings
from services.background_removal import router as bg_router


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


class FakeProcessor:
    async def process(self, image_data: bytes) -> bytes:
        return b"processed:" + image_data


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = bg_router.bg_service
    monkeypatch.setattr(service, "queue_manager", fake)
    monkeypatch.setattr(service, "processor", FakeProcessor())
    monkeypatch.setattr(service, "_initialized", True)
    return fake


@pytest.fixture
def client(queue):
    return TestClient(main.app)


def run_worker(queue):
    """Process queued jobs the way the worker would, with a fresh service state"""
    import asyncio

    service = bg_router.bg_service
    for job in queue.jobs:
        asyncio.run(service.process_job(job))


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_single_job_lifecycle(client, queue, sample_image_bytes):
    response = client.post(
        "/api/v1/background-removal/process",
        files={"file": ("cat.png", sample_image_bytes, "image/png")},
    )
    assert response.status_code == 200
    job_id = response.json()["job_id"]
    assert response.json()["status"] == "queued"

    status = client.get(f"/api/v1/background-removal/status/{job_id}").json()
    assert status["status"] == "queued"

    run_worker(queue)

    status = client.get(f"/api/v1/background-removal/status/{job_id}").json()
    assert status["status"] == "completed"
    result = client.get(f"/api/v1/background-removal/result/{job_id}")
    assert result.status_code == 200
    assert result.content == b"processed:" + sample_image_bytes


def test_status_survives_api_restart(client, queue, sample_image_bytes):
    job_id = client.post(
        "/api/v1/background-removal/process",
        files={"file": ("cat.png", sample_image_bytes, "image/png")},
    ).json()["job_id"]
    run_worker(queue)

    # Forget in-memory state, as a restarted API process would
    bg_router.bg_service.jobs.clear()

    assert client.get(f"/api/v1/background-removal/status/{job_id}").json()["status"] == "completed"


def test_batch_lifecycle_and_zip(client, queue, sample_image_bytes):
    files = [("files", (f"img{i}.png", sample_image_bytes, "image/png")) for i in range(3)]
    response = client.post("/api/v1/background-removal/process-batch", files=files)
    assert response.status_code == 200
    batch = response.json()
    assert batch["total_files"] == 3
    assert len(batch["job_ids"]) == 3

    run_worker(queue)

    status = client.get(f"/api/v1/background-removal/batch-status/{batch['batch_id']}").json()
    assert status["status"] == "completed"
    assert status["completed_files"] == 3
    assert status["progress"] == 100

    zip_response = client.get(f"/api/v1/background-removal/batch-results/{batch['batch_id']}")
    assert zip_response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(zip_response.content)) as archive:
        assert len(archive.namelist()) == 3


def test_rejects_non_images(client):
    response = client.post(
        "/api/v1/background-removal/process",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400


def test_rejects_oversized_files(client, monkeypatch):
    monkeypatch.setattr(settings, "max_file_size", 10)

    response = client.post(
        "/api/v1/background-removal/process",
        files={"file": ("big.png", b"x" * 11, "image/png")},
    )

    assert response.status_code == 413


def test_rejects_more_than_ten_files(client, sample_image_bytes):
    files = [("files", (f"img{i}.png", sample_image_bytes, "image/png")) for i in range(11)]

    response = client.post("/api/v1/background-removal/process-batch", files=files)

    assert response.status_code == 400


def test_unknown_job_returns_404(client):
    assert client.get("/api/v1/background-removal/status/missing").status_code == 404
