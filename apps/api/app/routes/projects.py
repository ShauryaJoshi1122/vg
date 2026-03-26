from fastapi import APIRouter, Depends

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Project
from app.db.session import get_session
from app.services.auth import get_current_user


router = APIRouter()


@router.get("")
async def list_projects(
  user=Depends(get_current_user),
  session: AsyncSession = Depends(get_session),
):
  result = await session.execute(select(Project).where(Project.user_id == user.id).order_by(Project.created_at.desc()))
  projects = result.scalars().all()
  return {"projects": [{"id": str(p.id), "name": p.name} for p in projects]}

