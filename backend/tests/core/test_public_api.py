import pytest
from fastapi.testclient import TestClient

import main
from config.settings import parse_list, settings
from core.public_api import RateLimiter, rate_limiter
from services.background_removal import router as bg_router

PUBLIC = {"X-Public-Api": "1"}


class FakeQueue:
    async def connect(self):
        pass

    async def send_job(self, job):
        pass


@pytest.fixture
def client(monkeypatch):
    service = bg_router.bg_service
    monkeypatch.setattr(service, "queue_manager", FakeQueue())
    monkeypatch.setattr(service, "_initialized", True)
    monkeypatch.setattr(settings, "api_keys", "key-one, key-two")
    rate_limiter.reset()
    yield TestClient(main.app)
    rate_limiter.reset()


def upload(sample_image_bytes):
    return {"file": ("a.png", sample_image_bytes, "image/png")}


def test_internal_requests_need_no_key(client, sample_image_bytes):
    response = client.post("/api/v1/background-removal/process", files=upload(sample_image_bytes))

    assert response.status_code == 200


def test_public_request_without_key_is_rejected(client, sample_image_bytes):
    response = client.post(
        "/api/v1/background-removal/process", files=upload(sample_image_bytes), headers=PUBLIC
    )

    assert response.status_code == 401


def test_public_request_with_wrong_key_is_rejected(client):
    response = client.get(
        "/api/v1/background-removal/status/abc", headers={**PUBLIC, "X-API-Key": "nope"}
    )

    assert response.status_code == 401


@pytest.mark.parametrize("auth", [{"X-API-Key": "key-two"}, {"Authorization": "Bearer key-one"}])
def test_public_request_with_key_is_accepted(client, sample_image_bytes, auth):
    response = client.post(
        "/api/v1/background-removal/process",
        files=upload(sample_image_bytes),
        headers={**PUBLIC, **auth},
    )

    assert response.status_code == 200
    assert response.json()["job_id"]


def test_public_api_is_off_without_keys(client, monkeypatch):
    monkeypatch.setattr(settings, "api_keys", "")

    response = client.get(
        "/api/v1/background-removal/status/abc", headers={**PUBLIC, "X-API-Key": "key-one"}
    )

    assert response.status_code == 403


def test_submissions_are_rate_limited_per_key(client, sample_image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "api_rate_limit_per_minute", 2)

    def submit(key):
        return client.post(
            "/api/v1/background-removal/process",
            files=upload(sample_image_bytes),
            headers={**PUBLIC, "X-API-Key": key},
        )

    assert submit("key-one").status_code == 200
    assert submit("key-one").status_code == 200
    limited = submit("key-one")
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) >= 1
    # Another key has its own allowance, and polling is counted separately
    assert submit("key-two").status_code == 200
    status = client.get(
        "/api/v1/background-removal/status/abc", headers={**PUBLIC, "X-API-Key": "key-one"}
    )
    assert status.status_code == 404


def test_rate_limiter_frees_slots_after_a_minute():
    limiter = RateLimiter()

    assert limiter.check("k", 1, now=0) is None
    assert limiter.check("k", 1, now=30) == 31
    assert limiter.check("k", 1, now=60) is None


def test_parse_list_accepts_json_and_commas():
    assert parse_list('["https://a.example", "https://b.example"]') == ["https://a.example", "https://b.example"]
    assert parse_list("https://a.example, https://b.example") == ["https://a.example", "https://b.example"]
    assert parse_list("") == []
