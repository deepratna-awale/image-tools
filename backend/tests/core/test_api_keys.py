import pytest
from fastapi.testclient import TestClient

import main
from config.settings import settings
from core import api_keys
from core.api_keys import ApiKeyStore
from core.public_api import rate_limiter
from services.background_removal import router as bg_router

PUBLIC = {"X-Public-Api": "1"}
ADMIN = {"Authorization": "Bearer admin-secret"}
KEYS = "/api/v1/admin/api-keys"


class FakeQueue:
    async def connect(self):
        pass

    async def send_job(self, job):
        pass


@pytest.fixture
def store(tmp_path, monkeypatch):
    store = ApiKeyStore(str(tmp_path / "keys.sqlite3"))
    monkeypatch.setattr(api_keys, "api_key_store", store)
    for module in ("core.public_api", "core.api_keys_router"):
        monkeypatch.setattr(f"{module}.api_key_store", store)
    yield store
    store.close()


@pytest.fixture
def client(store, monkeypatch):
    service = bg_router.bg_service
    monkeypatch.setattr(service, "queue_manager", FakeQueue())
    monkeypatch.setattr(service, "_initialized", True)
    monkeypatch.setattr(settings, "api_keys", "")
    monkeypatch.setattr(settings, "admin_token", "admin-secret")
    rate_limiter.reset()
    yield TestClient(main.app)
    rate_limiter.reset()


def create(client, name="My app", **extra):
    response = client.post(KEYS, json={"name": name, **extra}, headers=ADMIN)
    assert response.status_code == 200, response.text
    return response.json()


def submit(client, key, sample_image_bytes, count=1):
    headers = {**PUBLIC, "X-API-Key": key}
    if count == 1:
        files = {"file": ("a.png", sample_image_bytes, "image/png")}
        return client.post("/api/v1/background-removal/process", files=files, headers=headers)
    files = [("files", (f"{i}.png", sample_image_bytes, "image/png")) for i in range(count)]
    return client.post("/api/v1/background-removal/process-batch", files=files, headers=headers)


def test_admin_endpoints_need_the_admin_token(client):
    assert client.get(KEYS).status_code == 401
    assert client.get(KEYS, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get(KEYS, headers=ADMIN).status_code == 200


def test_key_management_is_off_without_admin_token(client, monkeypatch):
    monkeypatch.setattr(settings, "admin_token", "")

    assert client.get(KEYS, headers={"Authorization": "Bearer "}).status_code == 403


def test_wrong_admin_tokens_are_throttled(client):
    for _ in range(10):
        client.get(KEYS, headers={"Authorization": "Bearer wrong"})

    assert client.get(KEYS, headers={"Authorization": "Bearer wrong"}).status_code == 429
    # The right token still works
    assert client.get(KEYS, headers=ADMIN).status_code == 200


def test_created_key_is_shown_once_and_stored_hashed(client, store):
    created = create(client)

    assert created["key"].startswith("it_")
    listed = client.get(KEYS, headers=ADMIN).json()["keys"]
    assert [k["id"] for k in listed] == [created["id"]]
    assert "key" not in listed[0] and "key_hash" not in listed[0]
    raw = open(store.path, "rb").read()
    assert created["key"].encode() not in raw


def test_created_key_works_until_revoked(client, sample_image_bytes):
    key = create(client)

    assert submit(client, key["key"], sample_image_bytes).status_code == 200
    assert client.delete(f"{KEYS}/{key['id']}", headers=ADMIN).status_code == 200
    assert submit(client, key["key"], sample_image_bytes).status_code == 403  # no keys left: API off
    create(client, "Another")
    assert submit(client, key["key"], sample_image_bytes).status_code == 401


def test_daily_limit_per_key_counts_images(client, sample_image_bytes):
    key = create(client, daily_limit=3)["key"]

    assert submit(client, key, sample_image_bytes, count=2).status_code == 200
    assert submit(client, key, sample_image_bytes, count=2).status_code == 429
    assert submit(client, key, sample_image_bytes).status_code == 200
    limited = submit(client, key, sample_image_bytes)
    assert limited.status_code == 429
    assert "Daily limit" in limited.json()["detail"]
    assert int(limited.headers["Retry-After"]) >= 1
    listed = client.get(KEYS, headers=ADMIN).json()
    assert listed["keys"][0]["used_today"] == 3
    assert listed["used_today"] == 3


def test_daily_limit_across_all_keys(client, sample_image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "api_daily_limit_total", 2)
    one, two = create(client, "One")["key"], create(client, "Two")["key"]

    assert submit(client, one, sample_image_bytes).status_code == 200
    assert submit(client, two, sample_image_bytes).status_code == 200
    limited = submit(client, two, sample_image_bytes)
    assert limited.status_code == 429
    assert "all keys" in limited.json()["detail"]


def test_site_requests_are_not_counted(client, sample_image_bytes, store):
    files = {"file": ("a.png", sample_image_bytes, "image/png")}

    assert client.post("/api/v1/background-removal/process", files=files).status_code == 200
    assert store.used_today(api_keys.TOTAL) == 0


def test_env_keys_get_the_default_daily_limit(client, sample_image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "api_keys", "env-key")
    monkeypatch.setattr(settings, "api_daily_limit_per_key", 1)

    assert submit(client, "env-key", sample_image_bytes).status_code == 200
    assert submit(client, "env-key", sample_image_bytes).status_code == 429


def test_limits_on_key_creation(client, monkeypatch):
    monkeypatch.setattr(settings, "api_max_keys", 1)

    assert client.post(KEYS, json={"name": "Big", "daily_limit": 10**6}, headers=ADMIN).status_code == 400
    create(client)
    assert client.post(KEYS, json={"name": "Second"}, headers=ADMIN).status_code == 400
