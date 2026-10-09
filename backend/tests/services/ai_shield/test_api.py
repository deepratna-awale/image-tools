import io
import re

import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.ai_shield import router as shield_router
from services.ai_shield.cloak import STRENGTHS, LatentEncoders, Strength, cloak, target_pattern, texture_mask
from services.ai_shield.metadata import DATA_MINING_PROHIBITED, build_xmp


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


def tiny_encoders(count=2):
    """Small conv nets standing in for the SD encoders (8x downsampling, 4 latent channels)"""
    torch.manual_seed(0)
    nets = [
        torch.nn.Sequential(
            torch.nn.Conv2d(3, 8, 3, stride=2, padding=1),
            torch.nn.SiLU(),
            torch.nn.Conv2d(8, 8, 3, stride=2, padding=1),
            torch.nn.SiLU(),
            torch.nn.Conv2d(8, 4, 3, stride=2, padding=1),
        )
        for _ in range(count)
    ]
    return LatentEncoders(nets)


class FakeCache:
    def __init__(self):
        self.encoders = tiny_encoders()

    def get(self):
        return self.encoders


def photo(width=96, height=64, mode="RGB"):
    rng = np.random.default_rng(1)
    pixels = np.zeros((height, width, 3), dtype=np.uint8)
    pixels[: height // 2] = (120, 170, 230)  # flat sky
    pixels[height // 2:] = rng.integers(0, 255, (height - height // 2, width, 3))  # busy ground
    image = Image.fromarray(pixels).convert(mode)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = shield_router.shield_service
    monkeypatch.setattr(service, "queue_manager", fake)
    monkeypatch.setattr(service, "_initialized", True)
    monkeypatch.setattr(service.processor, "_encoders", FakeCache())
    return fake


@pytest.fixture
def client(queue):
    return TestClient(main.app)


def run_worker(queue):
    import asyncio

    for job in queue.jobs:
        try:
            asyncio.run(shield_router.shield_service.process_job(job))
        except Exception:
            pass  # failures are recorded on the job, as in the real worker


def result_image(client, job_id):
    assert client.get(f"/api/v1/ai-shield/status/{job_id}").json()["status"] == "completed"
    response = client.get(f"/api/v1/ai-shield/result/{job_id}")
    assert response.status_code == 200
    return Image.open(io.BytesIO(response.content))


def test_cloak_moves_latents_towards_target_within_budget():
    rgb = np.asarray(Image.open(io.BytesIO(photo(128, 96))).convert("RGB"))
    strength = Strength(work_size=96, steps=10, epsilon=8)
    result = cloak(rgb, tiny_encoders(), strength)

    assert result.image.shape == rgb.shape
    change = np.abs(result.image.astype(int) - rgb.astype(int))
    assert change.max() <= strength.epsilon + 1
    assert change.max() > 0
    for before, after in zip(result.target_gap_before, result.target_gap_after):
        assert after < before
    # Flat areas get a smaller budget than busy ones
    assert change[:40].max() < change[60:].max()


def test_texture_mask_range():
    mask = texture_mask(np.asarray(Image.open(io.BytesIO(photo())).convert("RGB")))
    assert mask.min() >= 0.19 and mask.max() <= 1.0


def test_target_pattern_size():
    assert target_pattern(64, 40).shape == (40, 64, 3)


def test_strengths_increase():
    low, medium, high = STRENGTHS["low"], STRENGTHS["medium"], STRENGTHS["high"]
    assert low.epsilon < medium.epsilon < high.epsilon


def test_xmp_marks_image_as_not_for_training():
    xmp = build_xmp("Ada <Lovelace>", None)
    assert DATA_MINING_PROHIBITED in xmp
    assert 'tdm:reservation="1"' in xmp
    assert "noimageai" in xmp
    assert "Ada &lt;Lovelace&gt;" in xmp


def test_shield_job_cloaks_and_tags(client, queue):
    job_id = client.post(
        "/api/v1/ai-shield/process",
        files={"file": ("art.png", photo(), "image/png")},
        data={"strength": "low", "creator": "Ada Lovelace"},
    ).json()["job_id"]

    run_worker(queue)

    image = result_image(client, job_id)
    assert image.size == (96, 64)
    xmp = image.info["XML:com.adobe.xmp"]
    assert DATA_MINING_PROHIBITED in xmp and "Ada Lovelace" in xmp
    exif = image.getexif()
    assert "Ada Lovelace" in exif[0x8298]
    assert "noai" in exif[0x010E]
    original = np.asarray(Image.open(io.BytesIO(photo())).convert("RGB")).astype(int)
    assert np.abs(np.asarray(image.convert("RGB")).astype(int) - original).max() > 0


def test_metadata_only_keeps_pixels(client, queue):
    job_id = client.post(
        "/api/v1/ai-shield/process",
        files={"file": ("art.png", photo(mode="RGBA"), "image/png")},
        data={"cloak": "false"},
    ).json()["job_id"]

    run_worker(queue)

    image = result_image(client, job_id)
    assert image.mode == "RGBA"
    assert np.array_equal(np.asarray(image), np.asarray(Image.open(io.BytesIO(photo(mode="RGBA")))))
    assert re.search("DMI-PROHIBITED", image.info["XML:com.adobe.xmp"])


def test_cloak_only_has_no_notice(client, queue):
    job_id = client.post(
        "/api/v1/ai-shield/process",
        files={"file": ("art.png", photo(), "image/png")},
        data={"metadata": "false", "strength": "low"},
    ).json()["job_id"]

    run_worker(queue)

    assert "XML:com.adobe.xmp" not in result_image(client, job_id).info


def test_rejects_bad_options(client):
    files = {"file": ("art.png", photo(), "image/png")}
    assert client.post("/api/v1/ai-shield/process", files=files, data={"strength": "max"}).status_code == 400
    assert client.post(
        "/api/v1/ai-shield/process", files=files, data={"cloak": "false", "metadata": "false"}
    ).status_code == 400
    assert client.post(
        "/api/v1/ai-shield/process", files=files, data={"creator": "x" * 201}
    ).status_code == 400
