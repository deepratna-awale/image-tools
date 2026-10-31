"""API keys for other apps, and how many images each may process per day.

Two kinds of key live here. Admin keys are created and revoked from the /api-keys
page with the admin token. Public keys are self-serve: anyone can create one on the
same page, with a smaller daily quota, a shared pool for all public keys, and a cap
on how many each network address may create (stored only as a salted hash).

Keys are stored as SHA-256 hashes in a small SQLite file on the shared storage
volume; the full key is shown once, at creation. Keys listed in API_KEYS in .env
keep working alongside them. Daily counts live in the same file, so restarts don't
reset them.
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
# Count against the global daily cap, and the pool for all public keys; belong to no key
TOTAL = "*"
PUBLIC_TOTAL = "public*"


class QuotaExceeded(Exception):
    def __init__(self, message: str, retry_after: int):
        super().__init__(message)
        self.retry_after = retry_after


class SignupRefused(QuotaExceeded):
    """A public key can't be created right now; retry_after says when it may work"""


@dataclass
class ApiKey:
    id: str
    name: str
    daily_limit: int
    from_env: bool = False
    public: bool = False


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
        self._salt = ""

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
                CREATE TABLE IF NOT EXISTS meta (
                    name TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(api_keys)")}
            if "public" not in columns:
                conn.execute("ALTER TABLE api_keys ADD COLUMN public INTEGER NOT NULL DEFAULT 0")
            if "ip_hash" not in columns:
                conn.execute("ALTER TABLE api_keys ADD COLUMN ip_hash TEXT")
            conn.execute("CREATE INDEX IF NOT EXISTS api_keys_ip_hash ON api_keys (ip_hash)")
            conn.execute(
                "INSERT OR IGNORE INTO meta (name, value) VALUES ('ip_salt', ?)", (secrets.token_hex(16),)
            )
            self._salt = conn.execute("SELECT value FROM meta WHERE name = 'ip_salt'").fetchone()[0]
            self._conn = conn
        return self._conn

    def _hash_ip(self, ip: str) -> str:
        # Salted so the stored value can't be matched against a list of addresses
        return hash_key(self._salt + ip)

    def close(self) -> None:
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    # Keys

    @staticmethod
    def _new_record(name: str, daily_limit: int, public: bool) -> Dict:
        key = KEY_PREFIX + secrets.token_urlsafe(30)
        return {
            "id": secrets.token_hex(8),
            "name": name,
            "prefix": key[:10],
            "key": key,
            "key_hash": hash_key(key),
            "daily_limit": daily_limit,
            "created_at": _now(),
            "public": int(public),
            "ip_hash": None,
        }

    @staticmethod
    def _insert(db: sqlite3.Connection, record: Dict) -> None:
        db.execute(
            "INSERT INTO api_keys (id, name, prefix, key_hash, daily_limit, created_at, public, ip_hash)"
            " VALUES (:id, :name, :prefix, :key_hash, :daily_limit, :created_at, :public, :ip_hash)",
            record,
        )

    def create(self, name: str, daily_limit: Optional[int] = None) -> Dict:
        """Create an admin key; the returned dict is the only place the full key appears"""
        record = self._new_record(name, daily_limit or settings.api_daily_limit_per_key, public=False)
        with self._lock:
            db = self._db()
            active = db.execute(
                "SELECT COUNT(*) FROM api_keys WHERE revoked_at IS NULL AND public = 0"
            ).fetchone()[0]
            if active >= settings.api_max_keys:
                raise ValueError(f"You already have {active} active keys; revoke one first")
            self._insert(db, record)
        return {**self._public(record, 0), "key": record["key"]}

    def create_public(self, name: str, ip: str) -> Dict:
        """Create a self-serve key, or raise SignupRefused when a signup limit is hit"""
        record = self._new_record(name, settings.api_public_daily_limit_per_key, public=True)
        with self._lock:
            db = self._db()
            record["ip_hash"] = self._hash_ip(ip)
            today = _today() + "%"
            db.execute("BEGIN IMMEDIATE")
            try:
                counts = db.execute(
                    """
                    SELECT
                        SUM(created_at LIKE :today),
                        SUM(created_at LIKE :today AND ip_hash = :ip),
                        SUM(revoked_at IS NULL AND ip_hash = :ip),
                        SUM(revoked_at IS NULL)
                    FROM api_keys WHERE public = 1
                    """,
                    {"today": today, "ip": record["ip_hash"]},
                ).fetchone()
                today_all, today_ip, active_ip, active_all = (value or 0 for value in counts)
                midnight = seconds_until_utc_midnight()
                if today_ip >= settings.api_public_keys_per_ip_per_day:
                    raise SignupRefused(
                        f"You can create {settings.api_public_keys_per_ip_per_day} keys a day; "
                        "try again after 00:00 UTC",
                        midnight,
                    )
                if active_ip >= settings.api_public_active_keys_per_ip:
                    raise SignupRefused(
                        f"You already have {active_ip} active keys; revoke one you don't use first",
                        3600,
                    )
                if today_all >= settings.api_public_signups_per_day or active_all >= settings.api_public_max_keys:
                    raise SignupRefused(
                        "No more keys can be created today; try again after 00:00 UTC", midnight
                    )
                self._insert(db, record)
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise
        return {**self._public(record, 0), "key": record["key"]}

    def describe(self, api_key: "ApiKey") -> Dict:
        """What a key's owner may see about it: limits and today's usage"""
        with self._lock:
            row = self._db().execute("SELECT * FROM api_keys WHERE id = ?", (api_key.id,)).fetchone()
        used = self.used_today(api_key.id)
        if row is None:  # a key from .env
            return {
                "name": api_key.name,
                "daily_limit": api_key.daily_limit,
                "used_today": used,
                "public": False,
                "rate_limit_per_minute": settings.api_rate_limit_per_minute,
                "resets_in_seconds": seconds_until_utc_midnight(),
            }
        return {
            **self._public(dict(row), used),
            "rate_limit_per_minute": rate_limit_for(api_key),
            "resets_in_seconds": seconds_until_utc_midnight(),
        }

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
            "public_used_today": self.used_today(PUBLIC_TOTAL),
            "public_daily_limit_total": settings.api_public_daily_limit_total,
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
            "public": bool(row.get("public")),
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
                "SELECT id, name, daily_limit, public FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
                (hash_key(key),),
            ).fetchone()
        if row is None:
            return None
        return ApiKey(id=row["id"], name=row["name"], daily_limit=row["daily_limit"], public=bool(row["public"]))

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
                        "SELECT key_id, images FROM usage WHERE day = ? AND key_id IN (?, ?, ?)",
                        (day, api_key.id, TOTAL, PUBLIC_TOTAL),
                    ).fetchall()
                )
                if used.get(api_key.id, 0) + images > api_key.daily_limit:
                    raise QuotaExceeded(
                        f"Daily limit reached for this key ({api_key.daily_limit} images per day, resets at 00:00 UTC)",
                        seconds_until_utc_midnight(),
                    )
                if api_key.public and used.get(PUBLIC_TOTAL, 0) + images > settings.api_public_daily_limit_total:
                    raise QuotaExceeded(
                        "Free keys have used up today's shared allowance; try again after 00:00 UTC",
                        seconds_until_utc_midnight(),
                    )
                if used.get(TOTAL, 0) + images > settings.api_daily_limit_total:
                    raise QuotaExceeded(
                        "The API has reached its daily limit for all keys; try again after 00:00 UTC",
                        seconds_until_utc_midnight(),
                    )
                buckets = (api_key.id, TOTAL, PUBLIC_TOTAL) if api_key.public else (api_key.id, TOTAL)
                for key_id in buckets:
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


def rate_limit_for(api_key: ApiKey) -> int:
    """Job submissions a key may make per minute"""
    if api_key.public:
        return settings.api_public_rate_limit_per_minute
    return settings.api_rate_limit_per_minute


api_key_store = ApiKeyStore()
