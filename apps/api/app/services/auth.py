from datetime import datetime
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, decode_token
from app.db.models import User
from app.db.session import get_session


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
  return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
  return pwd_context.verify(password, password_hash)


async def register_user(session: AsyncSession, *, email: str, password: str) -> User:
  result = await session.execute(select(User).where(User.email == email))
  existing = result.scalar_one_or_none()
  if existing:
    raise HTTPException(status_code=409, detail="Email already registered")

  user = User(
    email=email,
    password_hash=hash_password(password),
    plan="free"
  )
  session.add(user)
  await session.commit()
  await session.refresh(user)
  return user


async def login_user(session: AsyncSession, *, email: str, password: str) -> str:
  result = await session.execute(select(User).where(User.email == email))
  user = result.scalar_one_or_none()
  if not user or not verify_password(password, user.password_hash):
    raise HTTPException(status_code=401, detail="Invalid email or password")

  return create_access_token(subject=str(user.id), extra_claims={"email": user.email, "plan": user.plan})


async def get_current_user(
  authorization: Annotated[str | None, Header()] = None,
  session: AsyncSession = Depends(get_session)
) -> User:
  if not authorization:
    raise HTTPException(status_code=401, detail="Missing Authorization header")
  if not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Invalid Authorization header")

  token = authorization.split(" ", 1)[1].strip()
  try:
    payload = decode_token(token)
  except Exception:
    raise HTTPException(status_code=401, detail="Invalid or expired token")

  user_id = payload.get("sub")
  if not user_id:
    raise HTTPException(status_code=401, detail="Invalid token payload")

  result = await session.execute(select(User).where(User.id == user_id))
  user = result.scalar_one_or_none()
  if not user:
    raise HTTPException(status_code=401, detail="User not found")
  return user

