import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
from services.outpainting import models
from services.outpainting import router as outpainting_router
from services.outpainting.processor import parse_aspect_ratio, photo_weight, plan_canvas, plan_stages, work_size

PHOTO = (200, 50, 50)
PAINT = (0, 255, 0)


class FakeQueue:
    def __init__(self):
        self.jobs = []

    async def connect(self):
        pass

    async def send_job(self, job):
        self.jobs.append(job)

    async def get_queue_stats(self):
        return {}


class FakePainter:
    """Paints the masked area green, remembering what it was given"""

    def __init__(self):
        self.calls = []

    def paint(self, photo, canvas, mask, prompt="", **tuning):
        self.calls.append({"photo": photo.size, "canvas": canvas.size, "mask": np.array(mask), "prompt": prompt})
        result = np.array(canvas.convert("RGB"))
        result[np.array(mask) > 0] = PAINT
        return Image.fromarray(result)


def png(width=80, height=60, mode="RGB"):
    buffer = io.BytesIO()
    Image.new(mode, (width, height), PHOTO + (128,) if mode == "RGBA" else PHOTO).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture
def painter(monkeypatch):
    fake = FakePainter()
    monkeypatch.setattr(models, "get_painter", lambda: fake)
    monkeypatch.setattr(models, "on_gpu", lambda: True)
    monkeypatch.setattr(models, "enlarge", lambda rgb: rgb.repeat(4, axis=0).repeat(4, axis=1))
    return fake


@pytest.fixture
def queue(monkeypatch):
    fake = FakeQueue()
    service = outpainting_router.outpainting_service
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
            asyncio.run(outpainting_router.outpainting_service.process_job(job))
        except Exception:
            pass  # failures are recorded on the job, as in the real worker


def submit(client, image=None, data=None):
    files = {"file": ("photo.png", image or png(), "image/png")}
    return client.post("/api/v1/outpainting/process", files=files, data=data or {})


def status(client, job_id):
    return client.get(f"/api/v1/outpainting/status/{job_id}").json()


def result(client, job_id):
    assert status(client, job_id)["status"] == "completed", status(client, job_id)
    response = client.get(f"/api/v1/outpainting/result/{job_id}")
    assert response.status_code == 200
    return np.array(Image.open(io.BytesIO(response.content)))


def test_parse_aspect_ratio():
    assert parse_aspect_ratio("16:9") == pytest.approx(16 / 9)
    assert parse_aspect_ratio("4x5") == pytest.approx(0.8)
    assert parse_aspect_ratio("1.5") == pytest.approx(1.5)
    for bad in ("wide", "1:0", "10:1"):
        with pytest.raises(ValueError):
            parse_aspect_ratio(bad)


def test_plan_canvas_by_shape_zoom_and_sides():
    # A 4:3 photo to 16:9 keeps its height and centres it
    assert plan_canvas(800, 600, aspect_ratio="16:9") == (1067, 600, 133, 0)
    # A square from a landscape photo grows the height
    assert plan_canvas(800, 600, aspect_ratio="1:1") == (800, 800, 0, 100)
    # Zoom out keeps the shape
    assert plan_canvas(800, 600, zoom=1.5) == (1200, 900, 200, 150)
    assert plan_canvas(800, 600, aspect_ratio="1:1", zoom=1.5) == (1200, 1200, 200, 300)
    # Sides place the photo where asked
    assert plan_canvas(800, 600, left=0, top=200, right=100, bottom=0) == (900, 800, 0, 200)


def test_plan_canvas_refusals(monkeypatch):
    with pytest.raises(ValueError, match="Nothing to extend"):
        plan_canvas(800, 600, aspect_ratio="4:3")
    with pytest.raises(ValueError, match="3x"):
        plan_canvas(800, 600, right=2000)
    with pytest.raises(ValueError, match="Zoom"):
        plan_canvas(800, 600, zoom=2)
    with pytest.raises(ValueError, match="negative"):
        plan_canvas(800, 600, left=-5, right=50)
    monkeypatch.setattr("config.settings.settings.outpaint_max_output_pixels", 1000)
    with pytest.raises(ValueError, match="megapixels"):
        plan_canvas(800, 600, zoom=1.5)


def test_work_size_keeps_the_shape_at_about_a_megapixel():
    width, height = work_size(1920, 1080)
    assert width % 16 == 0 and height % 16 == 0
    assert abs(width / height - 16 / 9) < 0.02
    assert 0.9e6 < width * height < 1.1e6


def test_photo_weight_fades_only_on_extended_edges():
    weight = photo_weight(20, 10, 0, 2, 10, 6, seam=2)
    assert weight[5, 0] == 1  # left edge is the canvas edge: no fade
    assert weight[5, 9] < 1  # right edge was extended
    assert weight[2, 5] < 1 and weight[7, 5] < 1  # top and bottom too
    assert weight[5, 5] == 1
    assert weight[0, 5] == 0 and weight[5, 15] == 0


def test_new_area_is_painted_and_the_photo_kept(client, queue, painter):
    job_id = submit(client, data={"aspect_ratio": "16:9"}).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape == (60, 107, 3)
    assert tuple(pixels[30, 2]) == PAINT and tuple(pixels[30, 104]) == PAINT
    assert tuple(pixels[30, 53]) == PHOTO
    call = painter.calls[0]
    # The photo's extended edges are repainted a little way in; top and bottom aren't
    mask = call["mask"]
    assert mask[mask.shape[0] // 2, mask.shape[1] // 2] == 0
    assert mask[0, mask.shape[1] // 2] == 0
    assert call["photo"] == (80, 60)


def test_sides_and_prompt_are_passed_on(client, queue, painter):
    job_id = submit(client, data={"top": "30", "prompt": "  blue sky  "}).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape == (90, 80, 3)
    assert tuple(pixels[5, 40]) == PAINT
    assert tuple(pixels[80, 40]) == PHOTO
    assert painter.calls[0]["prompt"] == "blue sky"


def test_large_canvases_are_enlarged_with_the_upscaler(client, queue, painter, monkeypatch):
    monkeypatch.setattr("config.settings.settings.outpaint_work_pixels", 64 * 64)
    job_id = submit(client, png(400, 300), {"zoom": "1.5"}).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape == (450, 600, 3)
    assert tuple(pixels[5, 5]) == PAINT
    assert tuple(pixels[225, 300]) == PHOTO


def test_big_extensions_are_painted_in_one_way_passes():
    # 16:9 from 3:2 grows less than 1.5x: one pass
    assert plan_stages(1400, 934, 1660, 934, 130, 0, 1.5) == [(1660, 934, 130, 0)]
    # Taller by 2.7x: three passes, growing only the height
    stages = plan_stages(1400, 934, 1400, 2489, 0, 777, 1.5)
    assert len(stages) == 3 and all(stage[0] == 1400 and stage[2] == 0 for stage in stages)
    assert sum(stage[3] for stage in stages) == 777
    # Zooming out 1.5x: wider first, then taller, the photo ending in the middle
    stages = plan_stages(1400, 934, 2100, 1401, 350, 233, 1.5)
    assert stages == [(2100, 934, 350, 0), (2100, 1401, 0, 233)]
    for (width, height, _, _), (next_w, next_h, _, _) in zip([(1400, 934, 0, 0)] + stages, stages):
        assert max(next_w / width, next_h / height) <= 1.5 + 1e-3
        assert next_w == width or next_h == height


def test_long_one_way_extensions_are_painted_in_passes(client, queue, painter):
    job_id = submit(client, png(80, 60), {"aspect_ratio": "9:16"}).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape == (142, 80, 3)
    assert tuple(pixels[2, 40]) == PAINT and tuple(pixels[71, 40]) == PHOTO
    assert len(painter.calls) == 3
    # The first pass is shown the photo, the later ones the last pass's result
    assert painter.calls[0]["photo"] == (80, 60)
    assert painter.calls[1]["photo"] != (80, 60)


def test_zooming_out_widens_then_heightens(client, queue, painter):
    job_id = submit(client, png(80, 60), {"zoom": "1.5"}).json()["job_id"]
    run_worker(queue)
    pixels = result(client, job_id)
    assert pixels.shape == (90, 120, 3)
    assert tuple(pixels[2, 2]) == PAINT and tuple(pixels[45, 60]) == PHOTO
    assert len(painter.calls) == 2
    first, second = (call["mask"] for call in painter.calls)
    # First only the sides are painted, then only the top and bottom
    assert first[0, first.shape[1] // 2] == 0 and first[first.shape[0] // 2, 0] == 255
    assert second[0, second.shape[1] // 2] == 255


def test_without_a_gpu_the_job_fails_politely(client, queue, painter, monkeypatch):
    monkeypatch.setattr(models, "on_gpu", lambda: False)
    job_id = submit(client, data={"zoom": "1.5"}).json()["job_id"]
    run_worker(queue)
    job = status(client, job_id)
    assert job["status"] == "failed"
    assert "try again" in job["error_message"]


@pytest.mark.parametrize(
    "data, message",
    [
        ({}, "Say how to extend"),
        ({"aspect_ratio": "4:3"}, "Nothing to extend"),
        ({"aspect_ratio": "wide"}, "16:9"),
        ({"zoom": "1.5", "left": "10"}, "not both"),
        ({"right": "1000"}, "3x"),
        ({"zoom": "1.5", "prompt": "x" * 301}, "300"),
    ],
)
def test_bad_requests_are_refused_before_queuing(client, queue, data, message):
    response = submit(client, data=data)
    assert response.status_code == 400
    assert message in response.json()["detail"]
    assert queue.jobs == []


def test_batch(client, queue, painter):
    files = [("files", (f"{i}.png", png(), "image/png")) for i in range(2)]
    response = client.post("/api/v1/outpainting/process-batch", files=files, data={"aspect_ratio": "1:1"})
    assert response.status_code == 200
    run_worker(queue)
    for job_id in response.json()["job_ids"]:
        assert result(client, job_id).shape == (80, 80, 3)
