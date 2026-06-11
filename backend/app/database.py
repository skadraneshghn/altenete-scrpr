"""
Database setup with async SQLAlchemy engine and session management.
Configured for Clever Cloud MySQL free tier: max 5 simultaneous connections.
"""

import asyncio
import logging

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────
# Connection pool strategy
#
# Clever Cloud free MySQL addon: max_user_connections = 5
#
# NullPool means NO persistent connections are held between requests.
# Every query opens a fresh connection and closes it immediately on release.
# This is the safest strategy for a low-connection-limit free tier because
# idle pool connections were exhausting the 5-connection cap even when the
# app was serving zero traffic.
#
# Trade-off: slightly higher latency per request (connection handshake each
# time), but completely eliminates "OperationalError: Can't connect" caused
# by pool saturation or stale connections.
# ──────────────────────────────────────────────────────────────────────────

_is_mysql = "mysql" in settings.DATABASE_URL

if _is_mysql:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        poolclass=NullPool,  # no persistent connections — safest for 5-conn free tier
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
    """Create all tables in the database and run any hotfixes.

    Retries up to 5 times with exponential back-off so that a transient
    Clever Cloud MySQL blip at startup does not crash the whole process.
    """
    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            break  # success — exit retry loop
        except Exception as exc:
            if attempt == max_attempts:
                logger.error("init_db: all %d attempts failed. Last error: %s", max_attempts, exc)
                raise
            wait = 2 ** attempt  # 2, 4, 8, 16 seconds
            logger.warning(
                "init_db: attempt %d/%d failed (%s). Retrying in %ds…",
                attempt, max_attempts, exc, wait,
            )
            await asyncio.sleep(wait)

    async with engine.begin() as conn:
        
        # Add session_cookies column dynamically if it doesn't exist
        try:
            await conn.execute(text("ALTER TABLE forum_configs ADD COLUMN session_cookies TEXT"))
        except Exception:
            pass

        # Add parent_job_id for sub-job chaining
        try:
            await conn.execute(text("ALTER TABLE jobs ADD COLUMN parent_job_id INT NULL"))
        except Exception:
            pass

        # Add phase label column for sub-jobs
        try:
            await conn.execute(text("ALTER TABLE jobs ADD COLUMN phase VARCHAR(120) NULL"))
        except Exception:
            pass

        # Modify jobs.job_type to VARCHAR(50) to support dynamic operation types
        try:
            await conn.execute(text("ALTER TABLE jobs MODIFY COLUMN job_type VARCHAR(50) NOT NULL"))
        except Exception:
            pass

        # Add is_multipage column to threads
        try:
            await conn.execute(text("ALTER TABLE threads ADD COLUMN is_multipage TINYINT(1) DEFAULT 0 NOT NULL"))
        except Exception:
            pass

        # Add max_pages column to threads
        try:
            await conn.execute(text("ALTER TABLE threads ADD COLUMN max_pages INT DEFAULT 1 NOT NULL"))
        except Exception:
            pass


async def close_db():
    """Dispose of the database engine and close all pooled connections."""
    await engine.dispose()
