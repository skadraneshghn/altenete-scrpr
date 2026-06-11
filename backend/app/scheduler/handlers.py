"""
Job handlers - functions that execute scraping jobs.
"""

import asyncio
import logging
from app.scheduler.scheduler import scheduler
from app.scraper.engine import ScraperEngine
from app.database import AsyncSessionLocal
from app.models.job import Job, JobStatus
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Track running tasks for cancellation
_running_tasks: dict[int, asyncio.Task] = {}


async def execute_job(job_id: int):
    """
    Execute a scraping job by its ID.
    Loads the job config and runs the scraper engine.
    """
    logger.info(f"Executing job {job_id}")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()

        if not job:
            logger.error(f"Job {job_id} not found")
            return

        if job.status == JobStatus.CANCELLED:
            logger.info(f"Job {job_id} was cancelled before execution")
            return

        config_id = job.config_id
        if not config_id:
            logger.error(f"Job {job_id} has no config_id")
            return

    # Run the scraper engine
    engine = ScraperEngine(job_id=job_id, config_id=config_id)
    try:
        await engine.run()
    except Exception as e:
        logger.error(f"Job {job_id} failed with error: {e}", exc_info=True)
    finally:
        _running_tasks.pop(job_id, None)


async def trigger_job(job_id: int):
    """
    Trigger a job for immediate execution in the background.
    """
    logger.info(f"Triggering job {job_id}")

    # Schedule the job to run immediately using APScheduler
    scheduler.add_job(
        execute_job,
        args=[job_id],
        id=f"job_{job_id}",
        replace_existing=True,
    )


async def cancel_running_job(job_id: int):
    """Cancel a currently running job."""
    task = _running_tasks.get(job_id)
    if task and not task.done():
        task.cancel()
        logger.info(f"Cancelled running task for job {job_id}")
