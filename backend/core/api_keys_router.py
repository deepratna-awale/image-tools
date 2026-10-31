"""Endpoints behind the /api-keys page: admins list, create and revoke keys; anyone can create a self-serve key"""
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config.settings import settings
from core.api_keys import SignupRefused, api_key_store
from core.public_api import _request_key, rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/api-keys", tags=["API Keys"])

# Wrong admin tokens allowed per minute, across all callers
FAILED_LOGINS_PER_MINUTE = 10


def require_admin(request: Request) -> None:
    if not settings.admin_token:
        raise HTTPException(status_code=403, detail="Key management is off: set ADMIN_TOKEN in the server's .env")
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() == "bearer" and hmac.compare_digest(token.strip().encode(), settings.admin_token.encode()):
        return
    retry_after = rate_limiter.check("admin-login-failures", FAILED_LOGINS_PER_MINUTE)
    if retry_after is not None:
        raise HTTPException(status_code=429, detail="Too many wrong tokens; wait a minute", headers={"Retry-After": str(retry_after)})
    logger.warning("Wrong admin token for API key management")
    raise HTTPException(status_code=401, detail="Wrong admin token")


class CreateKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    daily_limit: int | None = Field(default=None, ge=1)


@router.get("", dependencies=[Depends(require_admin)])
def list_keys():
    return {"keys": api_key_store.list(), **api_key_store.summary()}


@router.post("", dependencies=[Depends(require_admin)])
def create_key(body: CreateKeyRequest):
    if body.daily_limit and body.daily_limit > settings.api_daily_limit_total:
        raise HTTPException(
            status_code=400,
            detail=f"Daily limit can be at most {settings.api_daily_limit_total}, the cap for all keys together",
        )
    try:
        return api_key_store.create(body.name.strip(), body.daily_limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{key_id}", dependencies=[Depends(require_admin)])
def revoke_key(key_id: str):
    if not api_key_store.revoke(key_id):
        raise HTTPException(status_code=404, detail="No active key with that id")
    return {"revoked": key_id}


# Self-serve keys: anyone can create one, then check or revoke it with the key itself.
# The site's frontend forwards these calls and passes the caller's address, which
# Caddy sets, in CLIENT_IP_HEADER; the API port is not reachable from outside.

public_router = APIRouter(prefix="/api-keys", tags=["API Keys"])

CLIENT_IP_HEADER = "x-client-ip"
# Signup attempts per address per minute, refused or not
SIGNUP_ATTEMPTS_PER_MINUTE = 5


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    # Hidden on the page, so people leave it empty; form-filling bots don't
    website: str = Field(default="", max_length=200)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get(CLIENT_IP_HEADER) or request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip()
    return ip or (request.client.host if request.client else "unknown")


def _own_key(request: Request):
    api_key = api_key_store.authenticate(_request_key(request))
    if api_key is None:
        raise HTTPException(status_code=401, detail="Missing or invalid API key", headers={"WWW-Authenticate": "Bearer"})
    return api_key


@public_router.get("/limits")
def public_limits():
    """The limits a self-serve key gets, for the sign-up page"""
    return {
        "signup_open": settings.api_public_signup,
        "daily_limit": settings.api_public_daily_limit_per_key,
        "rate_limit_per_minute": settings.api_public_rate_limit_per_minute,
        "poll_limit_per_minute": settings.api_poll_limit_per_minute,
        "keys_per_day": settings.api_public_keys_per_ip_per_day,
        "active_keys": settings.api_public_active_keys_per_ip,
    }


@public_router.post("")
def sign_up(body: SignupRequest, request: Request):
    if not settings.api_public_signup:
        raise HTTPException(status_code=403, detail="Self-serve API keys are turned off on this server")
    ip = _client_ip(request)
    retry_after = rate_limiter.check(f"signup:{ip}", SIGNUP_ATTEMPTS_PER_MINUTE)
    if retry_after is not None:
        raise HTTPException(status_code=429, detail="Too many attempts; wait a minute", headers={"Retry-After": str(retry_after)})
    if body.website:
        logger.info("Ignored a sign-up that filled the hidden field")
        raise HTTPException(status_code=400, detail="Could not create a key")
    try:
        created = api_key_store.create_public(body.name.strip(), ip)
    except SignupRefused as exc:
        raise HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": str(exc.retry_after)})
    logger.info("Created self-serve API key %s (%s)", created["prefix"], created["name"])
    return {**created, "rate_limit_per_minute": settings.api_public_rate_limit_per_minute}


@public_router.get("/me")
def my_key(request: Request):
    return api_key_store.describe(_own_key(request))


@public_router.delete("/me")
def revoke_my_key(request: Request):
    api_key = _own_key(request)
    if api_key.from_env:
        raise HTTPException(status_code=400, detail="Keys from the server's .env can't be revoked here")
    api_key_store.revoke(api_key.id)
    return {"revoked": api_key.id}
