"""
Database setup with async SQLAlchemy engine and session management.
Configured for Clever Cloud MySQL free tier: max 5 simultaneous connections.
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()

# ──────────────────────────────────────────────────────────────────────────
# Connection pool strategy
#
# Clever Cloud free MySQL addon: max_user_connections = 5
#
# We keep pool_size=2, max_overflow=2 → peak 4 real connections, leaving
# 1 spare for admin/monitoring tools.
#
# pool_recycle=1800   — drop connections idle for 30 min (avoids "gone away")
# pool_pre_ping=True  — test connection health before use
# pool_timeout=20     — raise after 20 s instead of hanging forever
# pool_reset_on_return="rollback" — clean state between requests
# ──────────────────────────────────────────────────────────────────────────

_is_mysql = "mysql" in settings.DATABASE_URL

if _is_mysql:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        pool_size=1,        # strictly keep only 1 persistent connection
        max_overflow=1,     # allow at most 1 burst connection (total max = 2)
        pool_timeout=30,    # wait longer for connections to clear before failing
        pool_recycle=900,   # recycle connections every 15 minutes to keep them fresh
    )
else:
    # SQLite / local dev — no connection limit concerns
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
    )

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass


async def get_db():
    """Dependency that yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


from sqlalchemy import text

async def init_db():
    """Create all tables in the database and run any hotfixes."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Add session_cookies column dynamically if it doesn't exist
        try:
            await conn.execute(text("ALTER TABLE forum_configs ADD COLUMN session_cookies TEXT"))
        except Exception:
            pass


async def close_db():
    """Dispose of the database engine and close all pooled connections."""
    await engine.dispose()
