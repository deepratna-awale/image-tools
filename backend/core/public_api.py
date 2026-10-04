"""API key check and rate limit for requests from other apps.

Caddy forwards /api/v1/background-removal/* from the public site straight to the
API and marks those requests with PUBLIC_API_HEADER. Requests without the mark
come from the site's own frontend over the internal network and pass through
unchanged; the API port itself is never published.
"""
import hmac
import logging
import time
from collections import defaultdict, deque
from typing import Deque, Dict, List, Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config.settings import settings

logger = logging.getLogger(__name__)

PUBLIC_API_HEADER = "x-public-api"
WINDOW_SECONDS = 60


class RateLimiter:
    """Rolling one-minute request counts per key, kept in memory (one API process)"""

    def __init__(self):
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def check(self, bucket: str, limit: int, now: Optional[float] = None) -> Optional[int]:
        """Record a request; return None if allowed, else seconds until a slot frees up"""
        now = time.monotonic() if now is None else now
        hits = self._hits[bucket]
        while hits and hits[0] <= now - WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit:
            return max(1, int(hits[0] + WINDOW_SECONDS - now) + 1)
        hits.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()


rate_limiter = RateLimiter()


def _request_key(request: Request) -> Optional[str]:
    key = request.headers.get("x-api-key")
    if key:
        return key.strip()
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and token:
        return token.strip()
    return None


def _matching_key(key: Optional[str], keys: List[str]) -> Optional[str]:
    if not key:
        return None
    for candidate in keys:
        if hmac.compare_digest(key.encode(), candidate.encode()):
            return candidate
    return None


def _error(status: int, message: str, headers: Optional[Dict[str, str]] = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": message}, headers=headers)


class PublicAPIMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if PUBLIC_API_HEADER not in request.headers or request.method == "OPTIONS":
            return await call_next(request)

        keys = settings.api_key_list
        if not keys:
            return _error(403, "The public API is not enabled on this server")

        key = _matching_key(_request_key(request), keys)
        if key is None:
            return _error(401, "Missing or invalid API key", {"WWW-Authenticate": "Bearer"})

        if request.method == "POST":
            bucket, limit = "submit", settings.api_rate_limit_per_minute
        else:
            bucket, limit = "poll", settings.api_poll_limit_per_minute
        retry_after = rate_limiter.check(f"{bucket}:{key}", limit)
        if retry_after is not None:
            logger.warning("Rate limit hit for API key %s… (%s)", key[:4], bucket)
            return _error(
                429,
                f"Rate limit exceeded ({limit} {'submissions' if bucket == 'submit' else 'requests'} per minute)",
                {"Retry-After": str(retry_after)},
            )

        return await call_next(request)
