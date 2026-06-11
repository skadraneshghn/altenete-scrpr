"""
PostgreSQL database layer for the card extraction subsystem.

Uses a SEPARATE async engine so it never interferes with the primary MySQL pool.
Tables are created once at startup and reused.
"""

import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import (
    String, Text, Integer, DateTime, Boolean, BigInteger, func, Index
)
from datetime import datetime

logger = logging.getLogger(__name__)


class CardBase(DeclarativeBase):
    """Separate declarative base so card tables never pollute the main schema."""
    pass


# ─────────────────────────── Models ──────────────────────────────────────────

class RawPost(CardBase):
    """
    Raw scraped post content that has been handed to the extractor.
    One row per forum post (thread_id unique).
    """
    __tablename__ = "raw_posts"

    id: Mapped[int]         = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thread_id: Mapped[int]  = mapped_column(BigInteger, nullable=False, unique=True, index=True)
    thread_xf_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    thread_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    thread_url: Mapped[str | None]   = mapped_column(Text, nullable=True)
    author: Mapped[str | None]       = mapped_column(String(255), nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cards_found: Mapped[int]         = mapped_column(Integer, default=0)
    scraped_at: Mapped[datetime]     = mapped_column(DateTime, server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_raw_posts_scraped_at", "scraped_at"),
    )


class ExtractedCard(CardBase):
    """
    One row per unique card extracted from forum posts.
    Deduplication is enforced on (card_number, exp_month, exp_year, cvv).
    """
    __tablename__ = "extracted_cards"

    id: Mapped[int]              = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    raw_post_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    card_number: Mapped[str]     = mapped_column(String(25), nullable=False)
    exp_month: Mapped[str]       = mapped_column(String(2), nullable=False)
    exp_year: Mapped[str]        = mapped_column(String(2), nullable=False)
    cvv: Mapped[str]             = mapped_column(String(4), nullable=False)
    pipe_format: Mapped[str]     = mapped_column(String(50), nullable=False)   # CARD|MM|YY|CVV
    source_thread_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    source_url: Mapped[str | None]       = mapped_column(Text, nullable=True)
    extracted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_extracted_cards_card_number", "card_number"),
        Index("ix_extracted_cards_extracted_at", "extracted_at"),
    )



# ─────────────────────────── Engine & Sessions ───────────────────────────────

_pg_engine = None
_PgSession = None


def get_pg_engine():
    return _pg_engine


def get_pg_session() -> async_sessionmaker:
    return _PgSession


async def init_card_db(pg_url: str):
    """Create the async PostgreSQL engine and ensure all tables exist."""
    global _pg_engine, _PgSession

    if _pg_engine is not None:
        return  # Already initialised

    # asyncpg driver
    if pg_url.startswith("postgresql://"):
        pg_url = pg_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif pg_url.startswith("postgres://"):
        pg_url = pg_url.replace("postgres://", "postgresql+asyncpg://", 1)

    logger.info("Connecting to card extraction PostgreSQL database...")
    _pg_engine = create_async_engine(
        pg_url,
        echo=False,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=3,
        pool_recycle=600,
    )
    _PgSession = async_sessionmaker(
        bind=_pg_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with _pg_engine.begin() as conn:
        await conn.run_sync(CardBase.metadata.create_all)

    logger.info("Card extraction PostgreSQL database initialised — tables ready.")


async def close_card_db():
    global _pg_engine
    if _pg_engine:
        await _pg_engine.dispose()
        _pg_engine = None
        logger.info("Card extraction PostgreSQL connection pool closed.")
