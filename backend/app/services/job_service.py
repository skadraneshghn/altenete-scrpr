"""
Job management service.
"""

import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.job import Job, JobLog, JobStatus, LogLevel

logger = logging.getLogger(__name__)


class JobService:
    """Service for managing scraping jobs."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_job(self, job: Job) -> Job:
        """Create a new job record."""
        self.db.add(job)
        await self.db.flush()
        await self.db.refresh(job)
        return job

    async def update_status(self, job_id: int, status: JobStatus, error_message: str | None = None):
        """Update job status."""
        from app.utils import sanitize_mysql_string
        result = await self.db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return

        job.status = status
        if status == JobStatus.RUNNING:
            job.started_at = datetime.now(timezone.utc)
        elif status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            job.completed_at = datetime.now(timezone.utc)
        if error_message:
            job.error_message = sanitize_mysql_string(error_message)

        await self.db.flush()

    async def update_progress(self, job_id: int, processed: int, total: int, failed: int = 0):
        """Update job progress counters."""
        result = await self.db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return

        job.processed_items = processed
        job.total_items = total
        job.failed_items = failed
        await self.db.flush()

    async def add_log(self, job_id: int, level: LogLevel, message: str):
        """Add a log entry for a job."""
        from app.utils import sanitize_mysql_string
        log = JobLog(
            job_id=job_id,
            level=level,
            message=sanitize_mysql_string(message),
        )
        self.db.add(log)
        await self.db.flush()

    async def is_cancelled(self, job_id: int) -> bool:
        """Check if a job has been cancelled."""
        result = await self.db.execute(select(Job.status).where(Job.id == job_id))
        status = result.scalar_one_or_none()
        return status == JobStatus.CANCELLED
