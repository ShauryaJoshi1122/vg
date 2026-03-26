from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
import stripe
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Plan, User, VideoJob
from app.db.session import get_session
from app.services.auth import get_current_user
from app.services.billing import plan_limits


router = APIRouter()


def get_stripe_client() -> stripe.Stripe:
  if not settings.stripe_secret_key:
    raise HTTPException(status_code=500, detail="STRIPE_SECRET_KEY is not configured")
  return stripe.Stripe(settings.stripe_secret_key)


@router.get("/usage")
async def usage(
  user=Depends(get_current_user),
  session: AsyncSession = Depends(get_session),
):
  limits = plan_limits(user.plan)
  now = datetime.now(timezone.utc)
  since = now - timedelta(days=30)

  q = select(func.count()).select_from(VideoJob).where(
    VideoJob.user_id == user.id,
    VideoJob.status == "succeeded",
    VideoJob.created_at >= since
  )
  res = await session.execute(q)
  used = int(res.scalar_one() or 0)
  limit = limits["video_limit_per_month"]

  return {
    "plan": user.plan,
    "used_videos_last_30_days": used,
    "limit_videos_last_30_days": limit,
    "remaining": max(0, limit - used)
  }


@router.post("/create-checkout-session")
async def create_checkout_session(
  user=Depends(get_current_user),
  session: AsyncSession = Depends(get_session),
):
  if not settings.stripe_price_pro_id:
    raise HTTPException(status_code=500, detail="STRIPE_PRICE_PRO_ID is not configured")

  stripe_client = get_stripe_client()

  # Ensure we have a Stripe customer id.
  if not user.stripe_customer_id:
    customer = stripe_client.customers.create(email=user.email)
    user.stripe_customer_id = customer.id
    session.add(user)
    await session.commit()
    await session.refresh(user)

  checkout = stripe_client.checkout.Session.create(
    mode="subscription",
    customer=user.stripe_customer_id,
    payment_method_types=["card"],
    line_items=[{"price": settings.stripe_price_pro_id, "quantity": 1}],
    success_url=settings.stripe_success_url,
    cancel_url=settings.stripe_cancel_url,
    metadata={"user_id": str(user.id)}
  )

  return {"url": checkout.url}


@router.post("/stripe-webhook")
async def stripe_webhook(request: Request):
  # For production, set `STRIPE_WEBHOOK_SECRET` and verify event signatures.
  if not settings.stripe_webhook_secret:
    raise HTTPException(status_code=500, detail="STRIPE_WEBHOOK_SECRET is not configured")

  payload = await request.body()
  sig = request.headers.get("Stripe-Signature")
  if not sig:
    raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

  stripe_client = get_stripe_client()
  try:
    event = stripe.Webhook.construct_event(
      payload=payload,
      sig_header=sig,
      secret=settings.stripe_webhook_secret
    )
  except Exception as e:
    raise HTTPException(status_code=400, detail=f"Invalid webhook signature: {e}")

  event_type = event.get("type")
  data_object: Any = event["data"]["object"]

  # Update user plan based on Stripe events.
  # Webhook handler uses DB session via get_session dependency in a minimal way.
  # In production, use a dedicated dependency or background task.
  from app.db.session import async_session_factory
  if async_session_factory is None:
    raise HTTPException(status_code=500, detail="DATABASE_URL is not configured")

  async with async_session_factory() as db_session:
    async def update_plan_for_customer(stripe_customer_id: str | None, plan: str):
      if not stripe_customer_id:
        return
      q = select(User).where(User.stripe_customer_id == stripe_customer_id)
      res = await db_session.execute(q)
      u = res.scalar_one_or_none()
      if not u:
        return
      u.plan = plan
      db_session.add(u)
      await db_session.commit()

    if event_type == "checkout.session.completed":
      customer_id = data_object.get("customer")
      await update_plan_for_customer(customer_id, Plan.pro.value)
    elif event_type in {"customer.subscription.deleted", "customer.subscription.updated"}:
      customer_id = data_object.get("customer")
      # If subscription no longer active, revert to free.
      status = data_object.get("status")
      if status and status != "active":
        await update_plan_for_customer(customer_id, Plan.free.value)

    return {"ok": True}

