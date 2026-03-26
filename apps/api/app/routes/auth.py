from fastapi import APIRouter, Depends
from pydantic import BaseModel

from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.services.auth import login_user, register_user


router = APIRouter()


class RegisterRequest(BaseModel):
  email: str
  password: str


class LoginRequest(BaseModel):
  email: str
  password: str


@router.post("/register")
async def register(req: RegisterRequest, session: AsyncSession = Depends(get_session)):
  await register_user(session, email=req.email.strip().lower(), password=req.password)
  return {"ok": True}


@router.post("/login")
async def login(req: LoginRequest, session: AsyncSession = Depends(get_session)):
  token = await login_user(session, email=req.email.strip().lower(), password=req.password)
  return {"token": token}

