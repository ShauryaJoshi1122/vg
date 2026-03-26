import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import httpx
import redis.asyncio as redis_async
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.config import settings
from app.db.models import Project, VideoAsset, VideoJob
from app.db.session import get_session
from app.services.auth import get_current_user
from app.services.billing import enforce_quota, enforce_rate_limit
from app.services.storage import get_presigned_download_url


router = APIRouter()


class GenerateVideoRequest(BaseModel):
  project_id: str | None = None
  prompt: str
  style_profile: str | None = None
  voice_profile: str | None = None
  target_duration_seconds: int | None = None


class GenerateVideoResponse(BaseModel):
  id: str
  status: str


@router.post("/generate-video", response_model=GenerateVideoResponse)
async def generate_video(
  req: GenerateVideoRequest,
  user=Depends(get_current_user),
  session: AsyncSession = Depends(get_session)
):
  # Enforce plan + rate limiting before spending compute.
  if not settings.redis_url:
    raise HTTPException(status_code=500, detail="REDIS_URL is not configured")

  redis = redis_async.Redis.from_url(settings.redis_url, decode_responses=False)
  try:
    await enforce_rate_limit(redis=redis, user_id=user.id, plan=user.plan)
    await enforce_quota(session, user_id=user.id, plan=user.plan)
  finally:
    await redis.aclose()

  prompt = req.prompt.strip()
  if len(prompt) < 10:
    raise HTTPException(status_code=400, detail="Prompt must be at least 10 characters")

  project_id_str = req.project_id
  project_uuid = None
  if not project_id_str:
    # Create a default project for convenience.
    project = Project(user_id=user.id, name="Default")
    session.add(project)
    await session.commit()
    await session.refresh(project)
    project_uuid = project.id
    project_id_str = str(project.id)
  else:
    try:
      project_uuid = UUID(project_id_str)
    except Exception:
      raise HTTPException(status_code=400, detail="Invalid project_id")

    project_q = select(Project).where(Project.id == project_uuid, Project.user_id == user.id)
    project_res = await session.execute(project_q)
    project = project_res.scalar_one_or_none()
    if not project:
      raise HTTPException(status_code=404, detail="Project not found")

  # Create DB record first (so the UI can poll even if enqueue fails).
  job = VideoJob(
    user_id=user.id,
    project_id=project_uuid,
    prompt=prompt,
    status="queued",
    current_step="queued",
    progress=0,
    target_duration_seconds=req.target_duration_seconds,
  )
  session.add(job)
  await session.commit()
  await session.refresh(job)

  # Enqueue the background pipeline (BullMQ producer) via an internal worker endpoint.
  # This keeps FastAPI decoupled from BullMQ internals.
  workerEnqueueUrl = os.environ.get("WORKER_ENQUEUE_URL", "http://localhost:3001/internal/enqueue")
  try:
    async with httpx.AsyncClient(timeout=10) as client:
      await client.post(workerEnqueueUrl, json={
        "jobId": str(job.id),
        "userId": str(user.id),
        "projectId": project_id_str,
        "prompt": prompt,
        "styleProfile": req.style_profile,
        "voiceProfile": req.voice_profile,
        "targetDurationSeconds": req.target_duration_seconds
      })
  except Exception:
    # If enqueue fails, user can retry generation; the job remains in queued state.
    pass

  return {"id": str(job.id), "status": job.status}


@router.get("/status/{id}")
async def status(
  id: str,
  user=Depends(get_current_user),
  session: AsyncSession = Depends(get_session)
):
  try:
    job_uuid = UUID(id)
  except Exception:
    raise HTTPException(status_code=400, detail="Invalid job id")

  job = await session.get(VideoJob, job_uuid)
  if not job or job.user_id != user.id:
    raise HTTPException(status_code=404, detail="Job not found")

  # Find final video asset if present.
  result = await session.execute(
    select(VideoAsset).where(VideoAsset.job_id == job.id, VideoAsset.asset_type == "final_video").order_by(VideoAsset.created_at.desc()).limit(1)
  )
  asset = result.scalar_one_or_none()

  final_video = None
  if asset:
    # In later to-dos we’ll implement signed download URLs.
    try:
      if asset.uri.startswith("s3://"):
        download_url = get_presigned_download_url(asset.uri)
      else:
        download_url = asset.uri
    except Exception:
      download_url = asset.uri

    final_video = {"uri": asset.uri, "download_url": download_url}

  return {
    "id": str(job.id),
    "status": job.status,
    "current_step": job.current_step,
    "progress": job.progress,
    "final_video": final_video
  }

