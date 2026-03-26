"""Initial schema for Flow by Earthin."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
import sqlalchemy.dialects.postgresql as psql


revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
  op.create_table(
    "users",
    sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
    sa.Column("email", sa.String(length=320), nullable=False),
    sa.Column("password_hash", sa.String(length=255), nullable=False),
    sa.Column("plan", sa.String(length=16), nullable=False, server_default="free"),
    sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
  )
  op.create_unique_constraint("uq_users_email", "users", ["email"])

  op.create_table(
    "projects",
    sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
    sa.Column("user_id", psql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("name", sa.String(length=200), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
  )

  op.create_table(
    "video_jobs",
    sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
    sa.Column("user_id", psql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("project_id", psql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
    sa.Column("prompt", sa.Text(), nullable=False),
    sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
    sa.Column("current_step", sa.String(length=64), nullable=True),
    sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("error_code", sa.String(length=64), nullable=True),
    sa.Column("error_message", sa.Text(), nullable=True),
    sa.Column("target_duration_seconds", sa.Integer(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
  )

  op.create_table(
    "video_assets",
    sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
    sa.Column("job_id", psql.UUID(as_uuid=True), sa.ForeignKey("video_jobs.id", ondelete="CASCADE"), nullable=False),
    sa.Column("asset_type", sa.String(length=64), nullable=False),
    sa.Column("scene_index", sa.Integer(), nullable=True),
    sa.Column("uri", sa.Text(), nullable=False),
    sa.Column("content_hash", sa.String(length=128), nullable=True),
    sa.Column("metadata", psql.JSONB(), nullable=True),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    sa.UniqueConstraint("job_id", "asset_type", "scene_index", name="uq_video_assets_job_asset_scene"),
  )

  op.create_table(
    "usage_events",
    sa.Column("id", psql.UUID(as_uuid=True), primary_key=True),
    sa.Column("user_id", psql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("job_id", psql.UUID(as_uuid=True), sa.ForeignKey("video_jobs.id", ondelete="SET NULL"), nullable=True),
    sa.Column("units", sa.Integer(), nullable=False),
    sa.Column("unit_type", sa.String(length=32), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
  )


def downgrade():
  op.drop_table("usage_events")
  op.drop_table("video_assets")
  op.drop_table("video_jobs")
  op.drop_table("projects")
  op.drop_table("users")

