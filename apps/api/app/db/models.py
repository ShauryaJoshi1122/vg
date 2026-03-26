import enum
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
  pass


class Plan(str, enum.Enum):
  free = "free"
  pro = "pro"


class User(Base):
  __tablename__ = "users"

  id: Mapped[Any] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
  email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
  password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
  plan: Mapped[str] = mapped_column(String(16), nullable=False, default=Plan.free.value)
  stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

  projects: Mapped[list["Project"]] = relationship(back_populates="user", cascade="all, delete-orphan")
  jobs: Mapped[list["VideoJob"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Project(Base):
  __tablename__ = "projects"

  id: Mapped[Any] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
  user_id: Mapped[Any] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
  name: Mapped[str] = mapped_column(String(200), nullable=False)

  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

  user: Mapped["User"] = relationship(back_populates="projects")
  jobs: Mapped[list["VideoJob"]] = relationship(back_populates="project")


class VideoJobStatus(str, enum.Enum):
  queued = "queued"
  running = "running"
  succeeded = "succeeded"
  failed = "failed"


class VideoJob(Base):
  __tablename__ = "video_jobs"

  id: Mapped[Any] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
  user_id: Mapped[Any] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
  project_id: Mapped[Any | None] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)

  prompt: Mapped[str] = mapped_column(Text, nullable=False)
  status: Mapped[str] = mapped_column(String(16), nullable=False, default=VideoJobStatus.queued.value)
  current_step: Mapped[str | None] = mapped_column(String(64), nullable=True)
  progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

  error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
  error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

  target_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
  updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

  user: Mapped["User"] = relationship(back_populates="jobs")
  project: Mapped["Project | None"] = relationship(back_populates="jobs")
  assets: Mapped[list["VideoAsset"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class VideoAssetType(str, enum.Enum):
  script = "script"
  scenes_json = "scenes_json"
  scene_visual = "scene_visual"
  scene_audio = "scene_audio"
  render_manifest = "render_manifest"
  final_video = "final_video"


class VideoAsset(Base):
  __tablename__ = "video_assets"

  id: Mapped[Any] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
  job_id: Mapped[Any] = mapped_column(UUID(as_uuid=True), ForeignKey("video_jobs.id", ondelete="CASCADE"), nullable=False)

  asset_type: Mapped[str] = mapped_column(String(64), nullable=False)
  scene_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
  uri: Mapped[str] = mapped_column(Text, nullable=False)
  content_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
  metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

  job: Mapped["VideoJob"] = relationship(back_populates="assets")

  __table_args__ = (
    UniqueConstraint("job_id", "asset_type", "scene_index", name="uq_video_assets_job_asset_scene"),
  )


class UsageEvent(Base):
  __tablename__ = "usage_events"

  id: Mapped[Any] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
  user_id: Mapped[Any] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
  job_id: Mapped[Any | None] = mapped_column(UUID(as_uuid=True), ForeignKey("video_jobs.id", ondelete="SET NULL"), nullable=True)

  units: Mapped[int] = mapped_column(Integer, nullable=False)
  unit_type: Mapped[str] = mapped_column(String(32), nullable=False)

  created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

