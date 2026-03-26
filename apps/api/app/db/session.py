from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


if not settings.database_url:
  # Allows scaffolding/imports to succeed without a configured database.
  # Production/dev runs should set DATABASE_URL.
  engine = None
  async_session_factory = None
else:
  engine = create_async_engine(settings.database_url, pool_pre_ping=True)
  async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
  if async_session_factory is None:
    raise RuntimeError("DATABASE_URL is not configured")
  async with async_session_factory() as session:
    yield session

