"""Admin endpoints behind the /api-keys page: list, create and revoke API keys"""
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from config.settings import settings
from core.api_keys import api_key_store
from core.public_api import rate_limiter

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
