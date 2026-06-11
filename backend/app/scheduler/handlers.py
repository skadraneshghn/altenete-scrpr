"""
Job handlers - functions that execute scraping jobs.

Execution model:
  - full_run creates two child sub-jobs (crawl_forum → scrape_threads) that run sequentially.
  - Each sub-job is individually registered in APScheduler so it appears in the scheduler queue.
  - Parent job status reflects the overall pipeline state.
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.scheduler.scheduler import scheduler
from app.scraper.engine import ScraperEngine
from app.database import AsyncSessionLocal
from app.models.job import Job, JobStatus, JobType, LogLevel
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Track running asyncio tasks keyed by job_id for cancellation support
_running_tasks: dict[int, asyncio.Task] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _update_job_status(job_id: int, status: JobStatus, error: str | None = None):
    """Persist a status change to the database."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return
        job.status = status
        if error:
            job.error_message = error
        if status == JobStatus.RUNNING and not job.started_at:
            job.started_at = datetime.now(timezone.utc)
        if status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            job.completed_at = datetime.now(timezone.utc)
        await db.commit()


async def _add_log(job_id: int, level: LogLevel, message: str):
    """Add a log entry for a job."""
    from app.models.job import JobLog
    async with AsyncSessionLocal() as db:
        db.add(JobLog(job_id=job_id, level=level, message=message))
        await db.commit()


# ---------------------------------------------------------------------------
# Single-phase job executor
# ---------------------------------------------------------------------------

async def execute_job(job_id: int):
    """
    Execute a single-phase scraping job (crawl_forum or scrape_threads).
    Called directly by APScheduler for non-full_run jobs or for sub-jobs.
    """
    logger.info(f"Executing job {job_id}")
    _running_tasks[job_id] = asyncio.current_task()

    try:
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

        engine = ScraperEngine(job_id=job_id, config_id=config_id)
        await engine.run()

    except asyncio.CancelledError:
        logger.info(f"Job {job_id} task was cancelled")
        await _update_job_status(job_id, JobStatus.CANCELLED)
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
    finally:
        _running_tasks.pop(job_id, None)


# ---------------------------------------------------------------------------
# Full-run pipeline orchestrator
# ---------------------------------------------------------------------------

async def execute_pipeline(parent_job_id: int):
    """
    Run the full crawl→scrape pipeline as sequential sub-jobs under a parent job.

    Steps:
      1. Mark parent as RUNNING.
      2. Create sub-job #1 (crawl_forum), register in APScheduler, wait for it.
      3. If crawl succeeded, create sub-job #2 (scrape_threads), wait for it.
      4. Mark parent COMPLETED or FAILED depending on outcomes.
    """
    logger.info(f"Starting pipeline for parent job {parent_job_id}")
    _running_tasks[parent_job_id] = asyncio.current_task()

    try:
        # ------------------------------------------------------------------
        # Load parent job
        # ------------------------------------------------------------------
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Job).where(Job.id == parent_job_id))
            parent = result.scalar_one_or_none()
            if not parent:
                logger.error(f"Parent job {parent_job_id} not found")
                return
            if parent.status == JobStatus.CANCELLED:
                logger.info(f"Parent job {parent_job_id} cancelled before pipeline start")
                return
            config_id = parent.config_id

        await _update_job_status(parent_job_id, JobStatus.RUNNING)
        await _add_log(parent_job_id, LogLevel.INFO, "Pipeline started — Phase 1: Forum Crawl queued")

        # ------------------------------------------------------------------
        # Phase 1 — crawl_forum
        # ------------------------------------------------------------------
        crawl_job_id = await _create_sub_job(
            parent_job_id=parent_job_id,
            config_id=config_id,
            job_type=JobType.CRAWL_FORUM,
            phase="Phase 1: Crawl Forum",
        )
        await _add_log(parent_job_id, LogLevel.INFO, f"Phase 1 sub-job created → Job #{crawl_job_id}")

        crawl_ok = await _run_sub_job(crawl_job_id, scheduler_id=f"sub_{parent_job_id}_crawl")

        if not crawl_ok:
            await _add_log(parent_job_id, LogLevel.ERROR, "Phase 1 (Crawl) failed — pipeline aborted")
            await _update_job_status(parent_job_id, JobStatus.FAILED, "Crawl phase failed")
            return

        # Check parent cancellation between phases
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Job).where(Job.id == parent_job_id))
            parent = result.scalar_one_or_none()
            if parent and parent.status == JobStatus.CANCELLED:
                logger.info(f"Parent job {parent_job_id} cancelled between phases")
                return

        await _add_log(parent_job_id, LogLevel.INFO, "Phase 1 complete — Phase 2: Thread Scrape queued")

        # ------------------------------------------------------------------
        # Phase 2 — scrape_threads
        # ------------------------------------------------------------------
        scrape_job_id = await _create_sub_job(
            parent_job_id=parent_job_id,
            config_id=config_id,
            job_type=JobType.SCRAPE_THREADS,
            phase="Phase 2: Scrape Threads",
        )
        await _add_log(parent_job_id, LogLevel.INFO, f"Phase 2 sub-job created → Job #{scrape_job_id}")

        scrape_ok = await _run_sub_job(scrape_job_id, scheduler_id=f"sub_{parent_job_id}_scrape")

        if scrape_ok:
            await _add_log(parent_job_id, LogLevel.INFO, "Pipeline completed successfully")
            await _update_job_status(parent_job_id, JobStatus.COMPLETED)
        else:
            await _add_log(parent_job_id, LogLevel.ERROR, "Phase 2 (Scrape) failed")
            await _update_job_status(parent_job_id, JobStatus.FAILED, "Scrape phase failed")

    except asyncio.CancelledError:
        logger.info(f"Pipeline {parent_job_id} cancelled")
        await _update_job_status(parent_job_id, JobStatus.CANCELLED)
    except Exception as e:
        logger.error(f"Pipeline {parent_job_id} error: {e}", exc_info=True)
        await _update_job_status(parent_job_id, JobStatus.FAILED, str(e))
    finally:
        _running_tasks.pop(parent_job_id, None)


async def _create_sub_job(parent_job_id: int, config_id: int, job_type: JobType, phase: str) -> int:
    """Create a child job record in the database and return its ID."""
    async with AsyncSessionLocal() as db:
        sub_job = Job(
            job_type=job_type,
            config_id=config_id,
            parent_job_id=parent_job_id,
            phase=phase,
            status=JobStatus.PENDING,
        )
        db.add(sub_job)
        await db.flush()
        await db.refresh(sub_job)
        job_id = sub_job.id
        await db.commit()
    return job_id


async def _run_sub_job(job_id: int, scheduler_id: str) -> bool:
    """
    Run a sub-job synchronously (awaiting its completion inside the pipeline coroutine).
    Registers a one-off APScheduler entry so it appears in the queue, then runs inline.
    Returns True if job completed successfully.
    """
    # Register in APScheduler so it shows in the scheduler queue page
    scheduler.add_job(
        _noop,
        id=scheduler_id,
        replace_existing=True,
        name=scheduler_id,
    )

    try:
        await execute_job(job_id)
    except Exception as e:
        logger.error(f"Sub-job {job_id} error: {e}", exc_info=True)
    finally:
        # Remove the marker from the scheduler queue once done
        try:
            scheduler.remove_job(scheduler_id)
        except Exception:
            pass

    # Check final status
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if job and job.status == JobStatus.COMPLETED:
            return True
    return False


async def _noop():
    """No-op placeholder used to mark a sub-job in the APScheduler queue."""
    pass


# ---------------------------------------------------------------------------
# Public trigger functions
# ---------------------------------------------------------------------------

async def trigger_job(job_id: int):
    """
    Trigger a job for immediate execution in the background via APScheduler.
    Automatically selects pipeline vs single-phase execution.
    """
    logger.info(f"Triggering job {job_id}")

    # Determine job type to pick the right handler
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        job_type = job.job_type if job else None

    handler = execute_pipeline if job_type == JobType.FULL_RUN else execute_job

    scheduler.add_job(
        handler,
        args=[job_id],
        id=f"job_{job_id}",
        replace_existing=True,
        name=f"{job_type} #{job_id}" if job_type else f"job_{job_id}",
    )


async def cancel_running_job(job_id: int):
    """Cancel a currently running job task."""
    task = _running_tasks.get(job_id)
    if task and not task.done():
        task.cancel()
        logger.info(f"Cancelled running task for job {job_id}")
