from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
import redis.asyncio as redis_async

from app.db.models import Plan, VideoJob


def plan_limits(plan: str) -> dict[str, int]:
  # Units are "generation jobs" per period.
  if plan == Plan.pro.value:
    return {
      "video_limit_per_month": 200,
      "rate_limit_per_minute": 20
    }
  return {
    "video_limit_per_month": 5,
    "rate_limit_per_minute": 2
  }


async def enforce_quota(session, *, user_id, plan: str) -> None:
  limits = plan_limits(plan)
  now = datetime.now(timezone.utc)
  since = now - timedelta(days=30)

  q = select(func.count()).select_from(VideoJob).where(
    VideoJob.user_id == user_id,
    VideoJob.status == "succeeded",
    VideoJob.created_at >= since
  )
  res = await session.execute(q)
  succeeded_count = int(res.scalar_one() or 0)
  if succeeded_count >= limits["video_limit_per_month"]:
    raise HTTPException(status_code=402, detail="Free tier monthly limit reached")


async def enforce_rate_limit(*, redis: redis_async.Redis, user_id, plan: str) -> None:
  limits = plan_limits(plan)
  now = datetime.now(timezone.utc)
  minute_bucket = int(now.timestamp() // 60)

  key = f"rl:{user_id}:{minute_bucket}"
  limit = limits["rate_limit_per_minute"]

  # Increment atomically; set TTL to cover the bucket.
  count = await redis.incr(key)
  if count == 1:
    await redis.expire(key, 90)
  if count > limit:
    raise HTTPException(status_code=429, detail="Rate limit exceeded")

