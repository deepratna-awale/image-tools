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


def test_created_key_works_until_revoked(client, sample_image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "api_public_signup", False)
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


SIGNUP = "/api/v1/api-keys"


def sign_up(client, name="Side project", ip="203.0.113.7"):
    return client.post(SIGNUP, json={"name": name}, headers={"X-Client-Ip": ip})


def test_anyone_can_create_a_key_with_public_limits(client, sample_image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "api_public_daily_limit_per_key", 2)
    response = sign_up(client)

    assert response.status_code == 200, response.text
    created = response.json()
    assert created["key"].startswith("it_") and created["public"] is True
    assert created["daily_limit"] == 2
    assert submit(client, created["key"], sample_image_bytes, count=2).status_code == 200
    limited = submit(client, created["key"], sample_image_bytes)
    assert limited.status_code == 429
    listed = client.get(KEYS, headers=ADMIN).json()
    assert listed["keys"][0]["public"] is True
    assert listed["public_used_today"] == 2


def test_api_answers_401_not_403_when_signup_is_open(client, sample_image_bytes, monkeypatch):
    assert submit(client, "it_nope", sample_image_bytes).status_code == 401
    monkeypatch.setattr(settings, "api_public_signup", False)
    assert submit(client, "it_nope", sample_image_bytes).status_code == 403
    assert sign_up(client).status_code == 403


def test_signups_are_limited_per_address(client, monkeypatch):
    monkeypatch.setattr(settings, "api_public_keys_per_ip_per_day", 2)

    assert sign_up(client).status_code == 200
    assert sign_up(client).status_code == 200
    refused = sign_up(client)
    assert refused.status_code == 429
    assert int(refused.headers["Retry-After"]) >= 1
    assert sign_up(client, ip="198.51.100.1").status_code == 200


def test_active_keys_per_address_and_revoking_frees_a_slot(client, monkeypatch):
    monkeypatch.setattr(settings, "api_public_active_keys_per_ip", 1)
    key = sign_up(client).json()["key"]

    assert sign_up(client).status_code == 429
    assert client.delete(f"{SIGNUP}/me", headers={"X-API-Key": key}).status_code == 200
    assert sign_up(client).status_code == 200


def test_signups_per_day_across_everyone(client, monkeypatch):
    monkeypatch.setattr(settings, "api_public_signups_per_day", 1)

    assert sign_up(client, ip="1.1.1.1").status_code == 200
    assert sign_up(client, ip="2.2.2.2").status_code == 429


def test_signup_attempts_are_throttled_per_minute(client):
    for _ in range(5):
        client.post(SIGNUP, json={"name": "Bot", "website": "x"}, headers={"X-Client-Ip": "9.9.9.9"})

    assert sign_up(client, ip="9.9.9.9").status_code == 429
    assert sign_up(client, ip="9.9.9.8").status_code == 200


def test_hidden_field_blocks_bots(client, store):
    response = client.post(SIGNUP, json={"name": "Bot", "website": "http://spam"}, headers={"X-Client-Ip": "5.5.5.5"})

    assert response.status_code == 400
    assert client.get(KEYS, headers=ADMIN).json()["keys"] == []


def test_addresses_are_stored_hashed(client, store):
    sign_up(client, ip="203.0.113.99")

    assert b"203.0.113.99" not in open(store.path, "rb").read()


def test_public_keys_share_a_daily_pool(client, sample_image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "api_public_daily_limit_total", 2)
    one = sign_up(client, ip="1.1.1.1").json()["key"]
    two = sign_up(client, ip="2.2.2.2").json()["key"]
    admin_key = create(client)["key"]

    assert submit(client, one, sample_image_bytes, count=2).status_code == 200
    limited = submit(client, two, sample_image_bytes)
    assert limited.status_code == 429
    assert "Free keys" in limited.json()["detail"]
    # Admin keys don't draw from the public pool
    assert submit(client, admin_key, sample_image_bytes).status_code == 200


def test_public_keys_get_a_lower_submission_rate(client, sample_image_bytes, monkeypatch):
    monkeypatch.setattr(settings, "api_public_rate_limit_per_minute", 2)
    key = sign_up(client).json()["key"]

    assert submit(client, key, sample_image_bytes).status_code == 200
    assert submit(client, key, sample_image_bytes).status_code == 200
    assert submit(client, key, sample_image_bytes).status_code == 429


def test_owner_can_see_their_usage(client, sample_image_bytes):
    key = sign_up(client).json()["key"]
    submit(client, key, sample_image_bytes)

    me = client.get(f"{SIGNUP}/me", headers={"Authorization": f"Bearer {key}"})
    assert me.status_code == 200
    assert me.json()["used_today"] == 1
    assert me.json()["rate_limit_per_minute"] == settings.api_public_rate_limit_per_minute
    assert client.get(f"{SIGNUP}/me").status_code == 401


def test_admin_key_cap_ignores_public_keys(client, monkeypatch):
    monkeypatch.setattr(settings, "api_max_keys", 1)
    sign_up(client)

    create(client)


def test_existing_database_gains_the_new_columns(tmp_path):
    import sqlite3

    path = str(tmp_path / "old.sqlite3")
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE api_keys (id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE, daily_limit INTEGER NOT NULL, created_at TEXT NOT NULL,
            last_used_at TEXT, revoked_at TEXT);
        INSERT INTO api_keys VALUES ('a', 'Old', 'it_x', 'hash', 200, '2026-10-01T00:00:00+00:00', NULL, NULL);
        """
    )
    conn.commit()
    conn.close()
    store = ApiKeyStore(path)

    assert store.list()[0]["public"] is False
    store.close()
