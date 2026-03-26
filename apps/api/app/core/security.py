from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt

from app.core.config import settings


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
  if not settings.jwt_secret:
    raise RuntimeError("JWT_SECRET is not configured")
  now = datetime.now(tz=timezone.utc)
  payload: dict[str, Any] = {
    "sub": subject,
    "iat": int(now.timestamp()),
    "exp": int((now + timedelta(hours=6)).timestamp()),
  }
  if extra_claims:
    payload.update(extra_claims)
  return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def decode_token(token: str) -> dict[str, Any]:
  if not settings.jwt_secret:
    raise RuntimeError("JWT_SECRET is not configured")
  return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])

