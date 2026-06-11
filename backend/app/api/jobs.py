"""
Job management API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.models.user import User
from app.models.job import Job, JobLog, JobStatus, JobType
from app.schemas.job import (
    JobCreate, JobResponse, JobListResponse,
    JobDetailResponse, JobLogResponse,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


def _job_to_response(job: Job) -> JobResponse:
    """Convert a Job model to a JobResponse schema."""
    progress = 0.0
    if job.total_items > 0:
        progress = round((job.processed_items / job.total_items) * 100, 1)

    return JobResponse(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        config_id=job.config_id,
        total_items=job.total_items,
        processed_items=job.processed_items,
        failed_items=job.failed_items,
        error_message=job.error_message,
        progress=progress,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
    )


@router.get("", response_model=JobListResponse)
async def list_jobs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: JobStatus | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all jobs with pagination and optional status filter."""
    query = select(Job)
    count_query = select(func.count(Job.id))

    if status_filter:
        query = query.where(Job.status == status_filter)
        count_query = count_query.where(Job.status == status_filter)

    # Get total count
    total = (await db.execute(count_query)).scalar() or 0

    # Get paginated results
    query = query.order_by(desc(Job.created_at)).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return JobListResponse(
        items=[_job_to_response(j) for j in jobs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    job_data: JobCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Create a new scraping job."""
    from app.models.forum import ForumConfig

    # Verify config exists
    result = await db.execute(select(ForumConfig).where(ForumConfig.id == job_data.config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Forum configuration not found",
        )

    job = Job(
        job_type=job_data.job_type,
        config_id=job_data.config_id,
        status=JobStatus.PENDING,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Trigger the job in background
    from app.scheduler.handlers import trigger_job
    await trigger_job(job.id)

    return _job_to_response(job)


@router.get("/{job_id}", response_model=JobDetailResponse)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get job details with logs."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get logs
    logs_result = await db.execute(
        select(JobLog)
        .where(JobLog.job_id == job_id)
        .order_by(desc(JobLog.created_at))
        .limit(200)
    )
    logs = logs_result.scalars().all()

    return JobDetailResponse(
        job=_job_to_response(job),
        logs=[JobLogResponse.model_validate(log) for log in logs],
    )


@router.post("/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cancel a running or pending job."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status not in (JobStatus.PENDING, JobStatus.RUNNING):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a job with status '{job.status}'",
        )

    job.status = JobStatus.CANCELLED
    await db.flush()
    await db.refresh(job)
    return _job_to_response(job)


@router.post("/{job_id}/retry", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def retry_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Retry a failed job by creating a new one with the same config."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    old_job = result.scalar_one_or_none()
    if not old_job:
        raise HTTPException(status_code=404, detail="Job not found")

    if old_job.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail="Only failed jobs can be retried")

    new_job = Job(
        job_type=old_job.job_type,
        config_id=old_job.config_id,
        status=JobStatus.PENDING,
    )
    db.add(new_job)
    await db.flush()
    await db.refresh(new_job)

    from app.scheduler.handlers import trigger_job
    await trigger_job(new_job.id)

    return _job_to_response(new_job)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete a job and its logs."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status == JobStatus.RUNNING:
        raise HTTPException(status_code=400, detail="Cannot delete a running job")

    await db.delete(job)


@router.get("/queue/status")
async def get_job_queue(
    _: User = Depends(get_current_user),
):
    """Get the current job scheduler state and queued jobs."""
    from app.scheduler.scheduler import scheduler
    from app.scheduler.handlers import _running_tasks

    jobs_list = []
    for job in scheduler.get_jobs():
        db_job_id = None
        if job.id.startswith("job_"):
            try:
                db_job_id = int(job.id.split("_")[1])
            except Exception:
                pass

        jobs_list.append({
            "id": job.id,
            "db_job_id": db_job_id,
            "name": job.name,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger": str(job.trigger),
            "is_running": db_job_id in _running_tasks if db_job_id else False,
            "is_paused": job.next_run_time is None,
        })

    from app.scheduler.scheduler import scheduler as aps_scheduler
    # In APScheduler, the scheduler state can be checked with .state (0 = STATE_STOPPED, 1 = STATE_RUNNING, 2 = STATE_PAUSED)
    # scheduler.running returns True if the scheduler thread/loop is active.
    # We want to check if the scheduler is paused vs running.
    scheduler_state = "stopped"
    if aps_scheduler.running:
        # Check if paused
        if hasattr(aps_scheduler, "_paused") and aps_scheduler._paused:
            scheduler_state = "paused"
        else:
            scheduler_state = "running"

    return {
        "scheduler_running": aps_scheduler.running,
        "scheduler_state": scheduler_state,
        "active_tasks_count": len(_running_tasks),
        "queue": jobs_list,
    }


@router.post("/scheduler/pause")
async def pause_scheduler(
    _: User = Depends(get_current_user),
):
    """Pause the scheduler (stops executing scheduled runs)."""
    from app.scheduler.scheduler import scheduler
    if scheduler.running:
        scheduler.pause()
    return {"status": "paused", "scheduler_running": scheduler.running}


@router.post("/scheduler/resume")
async def resume_scheduler(
    _: User = Depends(get_current_user),
):
    """Resume the scheduler (resumes executing scheduled runs)."""
    from app.scheduler.scheduler import scheduler
    if scheduler.running:
        scheduler.resume()
    else:
        scheduler.start()
    return {"status": "resumed", "scheduler_running": scheduler.running}


@router.post("/scheduler/jobs/{job_id}/pause")
async def pause_scheduler_job(
    job_id: str,
    _: User = Depends(get_current_user),
):
    """Pause a specific job in the scheduler."""
    from app.scheduler.scheduler import scheduler
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")
    job.pause()
    return {"status": "paused", "job_id": job_id}


@router.post("/scheduler/jobs/{job_id}/resume")
async def resume_scheduler_job(
    job_id: str,
    _: User = Depends(get_current_user),
):
    """Resume a specific job in the scheduler."""
    from app.scheduler.scheduler import scheduler
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")
    job.resume()
    return {"status": "resumed", "job_id": job_id}


@router.post("/scheduler/jobs/{job_id}/run")
async def run_scheduler_job_now(
    job_id: str,
    _: User = Depends(get_current_user),
):
    """Run a scheduled job immediately."""
    from app.scheduler.scheduler import scheduler
    from datetime import datetime, timezone
    job = scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scheduled job not found")
    
    # Set next run time to now to trigger immediately
    job.modify(next_run_time=datetime.now(timezone.utc))
    return {"status": "triggered_now", "job_id": job_id}

