"""
Dashboard API endpoints for stats and activity charts.
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, and_

from app.database import get_db
from app.models.user import User
from app.models.forum import Thread, Post
from app.models.job import Job, JobStatus
from app.schemas.job import DashboardStats, ActivityPoint, RecentJobResponse, JobResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get dashboard statistics."""
    total_threads = (await db.execute(select(func.count(Thread.id)))).scalar() or 0
    total_posts = (await db.execute(select(func.count(Post.id)))).scalar() or 0
    total_jobs = (await db.execute(select(func.count(Job.id)))).scalar() or 0

    active_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.status.in_([JobStatus.PENDING, JobStatus.RUNNING]))
    )).scalar() or 0

    completed_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.status == JobStatus.COMPLETED)
    )).scalar() or 0

    failed_jobs = (await db.execute(
        select(func.count(Job.id)).where(Job.status == JobStatus.FAILED)
    )).scalar() or 0

    finished_jobs = completed_jobs + failed_jobs
    success_rate = round((completed_jobs / finished_jobs * 100), 1) if finished_jobs > 0 else 0.0

    return DashboardStats(
        total_threads=total_threads,
        total_posts=total_posts,
        total_jobs=total_jobs,
        active_jobs=active_jobs,
        completed_jobs=completed_jobs,
        failed_jobs=failed_jobs,
        success_rate=success_rate,
    )


@router.get("/activity", response_model=list[ActivityPoint])
async def get_activity(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get scraping activity over the last N days."""
    now = datetime.now(timezone.utc)
    points = []

    for i in range(days - 1, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        thread_count = (await db.execute(
            select(func.count(Thread.id)).where(
                and_(Thread.scraped_at >= day_start, Thread.scraped_at < day_end)
            )
        )).scalar() or 0

        post_count = (await db.execute(
            select(func.count(Post.id)).where(
                and_(Post.scraped_at >= day_start, Post.scraped_at < day_end)
            )
        )).scalar() or 0

        points.append(ActivityPoint(
            date=day_start.strftime("%Y-%m-%d"),
            threads=thread_count,
            posts=post_count,
        ))

    return points


@router.get("/recent-jobs", response_model=list[RecentJobResponse])
async def get_recent_jobs(
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get the most recent jobs."""
    result = await db.execute(
        select(Job).order_by(Job.created_at.desc()).limit(limit)
    )
    jobs = result.scalars().all()
    return [RecentJobResponse.model_validate(j) for j in jobs]
