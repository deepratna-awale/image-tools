"""API keys for other apps, and how many images each may process per day.

Keys are created and revoked from the /api-keys page (admin token required) and
stored as SHA-256 hashes in a small SQLite file on the shared storage volume; the
full key is shown once, at creation. Keys listed in API_KEYS in .env keep working
alongside them. Daily counts live in the same file, so restarts don't reset them.
"""
import hashlib
import hmac
import os
import secrets
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

from config.settings import settings

KEY_PREFIX = "it_"
# Counts against the global daily cap but belongs to no key
TOTAL = "*"


class QuotaExceeded(Exception):
    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class ApiKey:
    id: str
    name: str
    daily_limit: int
    from_env: bool = False


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def seconds_until_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    return max(1, 86400 - (now.hour * 3600 + now.minute * 60 + now.second))


class ApiKeyStore:
    def __init__(self, path: Optional[str] = None):
        self._path = path
        self._lock = threading.Lock()
        self._conn: Optional[sqlite3.Connection] = None

    @property
    def path(self) -> str:
        return self._path or os.path.join(settings.local_storage_path, "api_keys.sqlite3")

    def _db(self) -> sqlite3.Connection:
        if self._conn is None:
            os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
            conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
            conn.row_factory = sqlite3.Row
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS api_keys (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    prefix TEXT NOT NULL,
                    key_hash TEXT NOT NULL UNIQUE,
                    daily_limit INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    last_used_at TEXT,
                    revoked_at TEXT
                );
                CREATE TABLE IF NOT EXISTS usage (
                    key_id TEXT NOT NULL,
                    day TEXT NOT NULL,
                    images INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (key_id, day)
                );
                """
            )
            self._conn = conn
        return self._conn

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    # Keys

    def create(self, name: str, daily_limit: Optional[int] = None) -> Dict:
        """Create a key; the returned dict is the only place the full key appears"""
        key = KEY_PREFIX + secrets.token_urlsafe(30)
        record = {
            "id": secrets.token_hex(8),
            "name": name,
            "prefix": key[:10],
            "key_hash": hash_key(key),
            "daily_limit": daily_limit or settings.api_daily_limit_per_key,
            "created_at": _now(),
        }
        with self._lock:
            db = self._db()
            active = db.execute("SELECT COUNT(*) FROM api_keys WHERE revoked_at IS NULL").fetchone()[0]
            if active >= settings.api_max_keys:
                raise ValueError(f"You already have {active} active keys; revoke one first")
            db.execute(
                "INSERT INTO api_keys (id, name, prefix, key_hash, daily_limit, created_at)"
                " VALUES (:id, :name, :prefix, :key_hash, :daily_limit, :created_at)",
                record,
            )
        return {**self._public(record, 0), "key": key}

    def revoke(self, key_id: str) -> bool:
        with self._lock:
            cursor = self._db().execute(
                "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (_now(), key_id)
            )
            return cursor.rowcount > 0

    def list(self) -> List[Dict]:
        with self._lock:
            db = self._db()
            rows = db.execute("SELECT * FROM api_keys ORDER BY created_at DESC").fetchall()
            used = dict(db.execute("SELECT key_id, images FROM usage WHERE day = ?", (_today(),)).fetchall())
        return [self._public(dict(row), used.get(row["id"], 0)) for row in rows]

    def summary(self) -> Dict:
        """Today's totals for the admin page"""
        return {
            "used_today": self.used_today(TOTAL),
            "daily_limit_total": settings.api_daily_limit_total,
            "default_daily_limit": settings.api_daily_limit_per_key,
            "max_keys": settings.api_max_keys,
            "env_keys": len(settings.api_key_list),
            "resets_in_seconds": seconds_until_utc_midnight(),
        }

    @staticmethod
    def _public(row: Dict, used_today: int) -> Dict:
        return {
            "id": row["id"],
            "name": row["name"],
            "prefix": row["prefix"],
            "daily_limit": row["daily_limit"],
            "used_today": used_today,
            "created_at": row["created_at"],
            "last_used_at": row.get("last_used_at"),
            "revoked_at": row.get("revoked_at"),
        }

    def has_keys(self) -> bool:
        if settings.api_key_list:
            return True
        with self._lock:
            return self._db().execute(
                "SELECT 1 FROM api_keys WHERE revoked_at IS NULL LIMIT 1"
            ).fetchone() is not None

    def authenticate(self, key: Optional[str]) -> Optional[ApiKey]:
        if not key:
            return None
        for candidate in settings.api_key_list:
            if hmac.compare_digest(key.encode(), candidate.encode()):
                return ApiKey(
                    id="env-" + hash_key(candidate)[:12],
                    name="Key from .env",
                    daily_limit=settings.api_daily_limit_per_key,
                    from_env=True,
                )
        if not key.startswith(KEY_PREFIX):
            return None
        # Lookup by hash: the stored value is a digest of a high-entropy key, so
        # matching on it leaks nothing useful about other keys
        with self._lock:
            row = self._db().execute(
                "SELECT id, name, daily_limit FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
                (hash_key(key),),
            ).fetchone()
        if row is None:
            return None
        return ApiKey(id=row["id"], name=row["name"], daily_limit=row["daily_limit"])

    # Usage

    def used_today(self, key_id: str) -> int:
        with self._lock:
            row = self._db().execute(
                "SELECT images FROM usage WHERE key_id = ? AND day = ?", (key_id, _today())
            ).fetchone()
        return row["images"] if row else 0

    def charge(self, api_key: ApiKey, images: int) -> None:
        """Count images against the key's and the server's daily limits, or raise QuotaExceeded"""
        day = _today()
        with self._lock:
            db = self._db()
            db.execute("BEGIN IMMEDIATE")
            try:
                used = dict(
                    db.execute(
                        "SELECT key_id, images FROM usage WHERE day = ? AND key_id IN (?, ?)",
                        (day, api_key.id, TOTAL),
                    ).fetchall()
                )
                if used.get(api_key.id, 0) + images > api_key.daily_limit:
                    raise QuotaExceeded(
                        f"Daily limit reached for this key ({api_key.daily_limit} images per day, resets at 00:00 UTC)",
                        seconds_until_utc_midnight(),
                    )
                if used.get(TOTAL, 0) + images > settings.api_daily_limit_total:
                    raise QuotaExceeded(
                        "The API has reached its daily limit for all keys; try again after 00:00 UTC",
                        seconds_until_utc_midnight(),
                    )
                for key_id in (api_key.id, TOTAL):
                    db.execute(
                        "INSERT INTO usage (key_id, day, images) VALUES (?, ?, ?)"
                        " ON CONFLICT (key_id, day) DO UPDATE SET images = images + excluded.images",
                        (key_id, day, images),
                    )
                if not api_key.from_env:
                    db.execute("UPDATE api_keys SET last_used_at = ? WHERE id = ?", (_now(), api_key.id))
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise


api_key_store = ApiKeyStore()
