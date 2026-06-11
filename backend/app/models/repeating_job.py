"""
RepeatingJob model — persists a watch/schedule that fires a job type
at a configurable interval, indefinitely.

Only the repeatable job types are supported:
  - check_new      (Check New Topics)
  - scrape_posts   (Scrape First Posts Only)

The actual execution is handled by APScheduler (IntervalTrigger).
Each active RepeatingJob maps to exactly one APScheduler job, keyed
by ``repeat_{id}``.
"""

from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import (
    String, Integer, DateTime, Boolean, Enum, func, Text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# Only these job types are allowed to repeat
REPEATABLE_JOB_TYPES = ("check_new", "scrape_posts")


class RepeatingJob(Base):
    """A persistent watch that fires a scraping operation on an interval."""

    __tablename__ = "repeating_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Which job type to fire each tick
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Which forum config to target
    config_id: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    # Human label (e.g. "Watch every 1 min")
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Interval in seconds — minimum 30 s to protect the forum from hammering
    interval_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    # Whether the watch is currently active
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Counters
    run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
