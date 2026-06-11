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
        parent_job_id=job.parent_job_id,
        phase=job.phase,
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
    # Only return TOP-LEVEL jobs (parent_job_id IS NULL) so sub-jobs don't clutter the list
    query = select(Job).where(Job.parent_job_id.is_(None))
    count_query = select(func.count(Job.id)).where(Job.parent_job_id.is_(None))

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
    await db.commit()
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


@router.get("/{job_id}/sub-jobs")
async def get_sub_jobs(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get all sub-jobs (pipeline phases) for a parent job."""
    result = await db.execute(
        select(Job)
        .where(Job.parent_job_id == job_id)
        .order_by(Job.created_at)
    )
    sub_jobs = result.scalars().all()
    return [_job_to_response(j) for j in sub_jobs]


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
    await db.commit()

    # Cancel active asyncio tasks for the job and its sub-jobs
    from app.scheduler.handlers import cancel_running_job
    await cancel_running_job(job_id)

    # Cancel any active sub-jobs
    sub_result = await db.execute(
        select(Job).where(
            Job.parent_job_id == job_id,
            Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING])
        )
    )
    sub_jobs = sub_result.scalars().all()
    for sub in sub_jobs:
        sub.status = JobStatus.CANCELLED
        await cancel_running_job(sub.id)
    
    await db.commit()
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
    await db.commit()
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
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Get the current job scheduler state and queued/running jobs.

    APScheduler removes a job from its internal queue the moment it starts
    executing. To show currently running jobs we merge two sources:
      1. scheduler.get_jobs()  — pending/future scheduled entries
      2. _running_tasks        — asyncio Tasks for jobs actively executing now
    """
    from app.scheduler.scheduler import scheduler as aps_scheduler
    from app.scheduler.handlers import _running_tasks

    jobs_list = []
    seen_aps_ids = set()

    # ── Source 1: APScheduler pending queue ──────────────────────────────────
    for job in aps_scheduler.get_jobs():
        seen_aps_ids.add(job.id)
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
            "is_running": False,   # still pending, not executing yet
            "is_paused": job.next_run_time is None,
            "phase": None,
            "job_type": None,
            "status": "pending",
        })

    # ── Source 2: Currently executing asyncio tasks ──────────────────────────
    for job_id, task in list(_running_tasks.items()):
        if task.done():
            continue  # already finished, will be cleaned up

        aps_id = f"job_{job_id}"
        if aps_id in seen_aps_ids:
            continue  # already represented above

        # Load live job info from the database
        result = await db.execute(select(Job).where(Job.id == job_id))
        db_job = result.scalar_one_or_none()
        if not db_job:
            continue

        job_type_label = db_job.job_type.replace("_", " ").title()
        phase_label = db_job.phase or job_type_label

        jobs_list.append({
            "id": aps_id,
            "db_job_id": job_id,
            "name": f"{job_type_label} #{job_id}",
            "next_run_time": None,
            "trigger": "⚡ executing",
            "is_running": True,
            "is_paused": False,
            "phase": db_job.phase,
            "job_type": db_job.job_type,
            "status": "running",
            "progress": round((db_job.processed_items / db_job.total_items) * 100, 1)
                        if db_job.total_items > 0 else 0,
            "processed_items": db_job.processed_items,
            "total_items": db_job.total_items,
            "config_id": db_job.config_id,
            "parent_job_id": db_job.parent_job_id,
        })

    # ── Scheduler engine state ────────────────────────────────────────────────
    scheduler_state = "stopped"
    if aps_scheduler.running:
        scheduler_state = "paused" if (hasattr(aps_scheduler, "_paused") and aps_scheduler._paused) else "running"

    return {
        "scheduler_running": aps_scheduler.running,
        "scheduler_state": scheduler_state,
        "active_tasks_count": len([t for t in _running_tasks.values() if not t.done()]),
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

