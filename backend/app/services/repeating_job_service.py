"""
RepeatingJobService — bridges RepeatingJob DB records with APScheduler.

Design goals
------------
- One APScheduler job per active RepeatingJob, id = ``repeat_{id}``
- Each tick spawns a NEW one-shot scraping Job and fires it, but only
  if no job of the same type+config is currently running (skip-if-busy).
- Counters (run_count, last_run_at, next_run_at) are updated on every tick.
- Interval can be updated live: existing scheduler job is rescheduled.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.job import Job, JobStatus
from app.models.repeating_job import RepeatingJob, REPEATABLE_JOB_TYPES
from app.scheduler.scheduler import scheduler

logger = logging.getLogger(__name__)

# Minimum allowed interval (seconds) — protects forum from hammering
MIN_INTERVAL_SECONDS = 30


def _aps_id(repeating_id: int) -> str:
    return f"repeat_{repeating_id}"


# ---------------------------------------------------------------------------
# Single-tick executor
# ---------------------------------------------------------------------------

async def _fire_repeating_job(repeating_id: int) -> None:
    """
    Called by APScheduler on each interval tick.

    1. Re-load the RepeatingJob from DB (may have been paused/deleted).
    2. Skip if another job of the same type+config is already running.
    3. Create a one-shot Job and trigger it.
    4. Update counters.
    """
    async with AsyncSessionLocal() as db:
        # Reload from DB
        result = await db.execute(
            select(RepeatingJob).where(RepeatingJob.id == repeating_id)
        )
        rj = result.scalar_one_or_none()
        if not rj or not rj.is_active:
            logger.debug("RepeatingJob %s inactive — skip tick", repeating_id)
            return

        # Skip-if-busy: avoid queuing the same job type twice
        busy = await db.execute(
            select(Job.id).where(
                Job.config_id == rj.config_id,
                Job.job_type == rj.job_type,
                Job.status.in_([JobStatus.RUNNING, JobStatus.PENDING]),
            ).limit(1)
        )
        if busy.scalar_one_or_none() is not None:
            logger.info(
                "RepeatingJob %s skipping tick — %s/%s already active",
                repeating_id, rj.job_type, rj.config_id,
            )
            return

        # Create a new one-shot job
        new_job = Job(
            job_type=rj.job_type,
            config_id=rj.config_id,
            status=JobStatus.PENDING,
            phase=f"[Watch #{rj.id}] {rj.label or rj.job_type}",
        )
        db.add(new_job)
        await db.flush()
        await db.refresh(new_job)
        job_id = new_job.id

        # Update counters
        rj.run_count += 1
        rj.last_run_at = datetime.now(timezone.utc)

        # Estimate next_run_at from the scheduler
        aps_job = scheduler.get_job(_aps_id(repeating_id))
        if aps_job and aps_job.next_run_time:
            rj.next_run_at = aps_job.next_run_time

        await db.commit()
        logger.info(
            "RepeatingJob %s fired → Job #%s (%s)",
            repeating_id, job_id, rj.job_type,
        )

    # Trigger the one-shot job outside of the DB session
    from app.scheduler.handlers import trigger_job
    await trigger_job(job_id)


# ---------------------------------------------------------------------------
# Scheduler wiring helpers
# ---------------------------------------------------------------------------

def _register_in_scheduler(rj: RepeatingJob) -> None:
    """Add or replace this RepeatingJob in APScheduler."""
    aps_id = _aps_id(rj.id)
    interval = max(rj.interval_seconds, MIN_INTERVAL_SECONDS)

    scheduler.add_job(
        _fire_repeating_job,
        trigger=IntervalTrigger(seconds=interval),
        args=[rj.id],
        id=aps_id,
        name=f"Watch #{rj.id}: {rj.job_type} every {interval}s",
        replace_existing=True,
        misfire_grace_time=30,
    )
    logger.info(
        "Registered repeating job %s → %s every %ds",
        aps_id, rj.job_type, interval,
    )


def _remove_from_scheduler(repeating_id: int) -> None:
    """Remove this RepeatingJob from APScheduler (if present)."""
    aps_id = _aps_id(repeating_id)
    try:
        scheduler.remove_job(aps_id)
        logger.info("Removed repeating job %s from scheduler", aps_id)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Public service
# ---------------------------------------------------------------------------

class RepeatingJobService:
    """CRUD + scheduler management for RepeatingJob records."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Create ───────────────────────────────────────────────────────────────

    async def create(
        self,
        job_type: str,
        config_id: int,
        interval_seconds: int,
        label: str | None = None,
    ) -> RepeatingJob:
        if job_type not in REPEATABLE_JOB_TYPES:
            raise ValueError(
                f"Job type '{job_type}' is not repeatable. "
                f"Allowed: {REPEATABLE_JOB_TYPES}"
            )

        interval_seconds = max(interval_seconds, MIN_INTERVAL_SECONDS)

        rj = RepeatingJob(
            job_type=job_type,
            config_id=config_id,
            interval_seconds=interval_seconds,
            label=label or f"{job_type.replace('_', ' ').title()} every {interval_seconds}s",
            is_active=True,
        )
        self.db.add(rj)
        await self.db.flush()
        await self.db.refresh(rj)

        _register_in_scheduler(rj)

        # Immediately update next_run_at
        aps_job = scheduler.get_job(_aps_id(rj.id))
        if aps_job and aps_job.next_run_time:
            rj.next_run_at = aps_job.next_run_time

        return rj

    # ── Read ─────────────────────────────────────────────────────────────────

    async def list_all(self) -> list[RepeatingJob]:
        result = await self.db.execute(
            select(RepeatingJob).order_by(RepeatingJob.created_at.desc())
        )
        return list(result.scalars().all())

    async def get(self, repeating_id: int) -> RepeatingJob | None:
        result = await self.db.execute(
            select(RepeatingJob).where(RepeatingJob.id == repeating_id)
        )
        return result.scalar_one_or_none()

    # ── Update ────────────────────────────────────────────────────────────────

    async def set_active(self, repeating_id: int, active: bool) -> RepeatingJob | None:
        rj = await self.get(repeating_id)
        if not rj:
            return None
        rj.is_active = active
        if active:
            _register_in_scheduler(rj)
        else:
            _remove_from_scheduler(repeating_id)
        return rj

    async def update_interval(
        self, repeating_id: int, interval_seconds: int
    ) -> RepeatingJob | None:
        rj = await self.get(repeating_id)
        if not rj:
            return None
        rj.interval_seconds = max(interval_seconds, MIN_INTERVAL_SECONDS)
        if rj.is_active:
            _register_in_scheduler(rj)  # replace_existing=True reschedules
        return rj

    # ── Delete ────────────────────────────────────────────────────────────────

    async def delete(self, repeating_id: int) -> bool:
        rj = await self.get(repeating_id)
        if not rj:
            return False
        _remove_from_scheduler(repeating_id)
        await self.db.delete(rj)
        return True

    # ── Startup restore ───────────────────────────────────────────────────────

    @staticmethod
    async def restore_all_on_startup() -> None:
        """Re-register all active RepeatingJobs after server restart."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(RepeatingJob).where(RepeatingJob.is_active == True)
            )
            active = result.scalars().all()
            for rj in active:
                _register_in_scheduler(rj)
            logger.info(
                "Restored %d active repeating job(s) to scheduler", len(active)
            )
