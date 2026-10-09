import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main

IMAGES = Path(__file__).parent / "images"


@pytest.fixture
def client():
    return TestClient(main.app)


def read(client, content, filename="image.png", content_type="image/png"):
    return client.post(
        "/api/v1/metadata-reading/read",
        files={"file": (filename, content, content_type)},
    )


@pytest.mark.parametrize(
    "filename, generator, prompt",
    [
        ("automatic1111_cropped.png", "AUTOMATIC1111", "photo of a duck"),
        ("automatic1111_cropped.jpg", "AUTOMATIC1111", "photo of a duck"),
        ("automatic1111_stealth.png", "AUTOMATIC1111", "a circle"),
        ("img2img_cropped.png", "ComfyUI", "photograph of victorian woman with wings"),
        ("fooocus1_cropped.png", "Fooocus", "a smiling goldfish"),
        ("invokeai_imeta1.png", "InvokeAI", "digital artwork, oil painting"),
        ("novelai1_cropped.png", "NovelAI", "cat, space, icon"),
    ],
)
def test_reads_each_generator(client, filename, generator, prompt):
    content_type = "image/jpeg" if filename.endswith(".jpg") else "image/png"
    response = read(client, (IMAGES / filename).read_bytes(), filename, content_type)

    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    assert body["generator"] == generator
    assert prompt in body["prompt"]
    assert body["samplers"]


def test_a1111_details(client):
    body = read(client, (IMAGES / "automatic1111_cropped.png").read_bytes()).json()

    assert body["models"] == [{"name": "realistic_realisticVisionV20_v20", "hash": body["models"][0]["hash"]}]
    sampler = body["samplers"][0]
    assert sampler["name"] == "UniPC"
    assert sampler["parameters"]["seed"] == "235284042"
    assert sampler["parameters"]["steps"] == "15"
    assert "parameters" in body["raw"]


def test_image_without_metadata(client):
    buffer = io.BytesIO()
    Image.new("RGB", (12, 8), "red").save(buffer, format="PNG")

    response = read(client, buffer.getvalue())

    assert response.status_code == 200
    assert response.json() == {"found": False, "image": {"format": "PNG", "width": 12, "height": 8}}


def test_rejects_non_images(client):
    assert read(client, b"hello", "notes.txt", "text/plain").status_code == 400
    assert read(client, b"not really a png").status_code == 400
