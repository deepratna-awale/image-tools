"""API key check and rate limits for requests from other apps.

Caddy forwards /api/v1/background-removal/*, /api/v1/upscaling/* and
/api/v1/watermark-removal/* from the public site straight to the API and marks
those requests with PUBLIC_API_HEADER. Requests without the mark come from the
site's own frontend over the internal network and pass through unchanged; the API port itself is never published.

Per-minute limits are checked here; daily image quotas are charged by the
submission endpoints (charge_images), since only they know how many images a
request carries. Keys and quotas themselves live in core/api_keys.py.
"""
import logging
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config.settings import settings
from core.api_keys import QuotaExceeded, api_key_store, rate_limit_for

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


def _error(status: int, message: str, headers: Optional[Dict[str, str]] = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": message}, headers=headers)


class PublicAPIMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if PUBLIC_API_HEADER not in request.headers or request.method == "OPTIONS":
            return await call_next(request)

        api_key = api_key_store.authenticate(_request_key(request))
        if api_key is None:
            if not settings.api_public_signup and not api_key_store.has_keys():
                return _error(403, "The public API is not enabled on this server")
            return _error(401, "Missing or invalid API key", {"WWW-Authenticate": "Bearer"})
        request.state.api_key = api_key

        if request.method == "POST":
            bucket, limit = "submit", rate_limit_for(api_key)
        else:
            bucket, limit = "poll", settings.api_poll_limit_per_minute
        retry_after = rate_limiter.check(f"{bucket}:{api_key.id}", limit)
        if retry_after is not None:
            logger.warning("Rate limit hit for API key %s (%s)", api_key.name, bucket)
            return _error(
                429,
                f"Rate limit exceeded ({limit} {'submissions' if bucket == 'submit' else 'requests'} per minute)",
                {"Retry-After": str(retry_after)},
            )

        return await call_next(request)


def charge_images(request: Request, images: int) -> None:
    """Count a submission against its key's daily quota; site requests are free"""
    api_key = getattr(request.state, "api_key", None)
    if api_key is None:
        return
    try:
        api_key_store.charge(api_key, images)
    except QuotaExceeded as exc:
        logger.warning("Daily quota hit for API key %s: %s", api_key.name, exc)
        raise HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)})
