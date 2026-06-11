"""
Repeating Jobs API — CRUD endpoints for Watch / interval operations.

All endpoints require authentication.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.repeating_job import REPEATABLE_JOB_TYPES
from app.models.user import User
from app.services.repeating_job_service import RepeatingJobService, MIN_INTERVAL_SECONDS

router = APIRouter(prefix="/api/watches", tags=["Watches"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class WatchCreate(BaseModel):
    job_type: str = Field(
        ...,
        description=f"Must be one of: {REPEATABLE_JOB_TYPES}",
        examples=["check_new"],
    )
    config_id: int
    interval_seconds: int = Field(
        default=60,
        ge=MIN_INTERVAL_SECONDS,
        description=f"Repeat interval in seconds. Minimum {MIN_INTERVAL_SECONDS}s.",
    )
    label: str | None = Field(default=None, max_length=255)


class WatchUpdateInterval(BaseModel):
    interval_seconds: int = Field(ge=MIN_INTERVAL_SECONDS)


class WatchResponse(BaseModel):
    id: int
    job_type: str
    config_id: int
    label: str | None
    interval_seconds: int
    is_active: bool
    run_count: int
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[WatchResponse])
async def list_watches(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all repeating watches."""
    svc = RepeatingJobService(db)
    return await svc.list_all()


@router.post("", response_model=WatchResponse, status_code=status.HTTP_201_CREATED)
async def create_watch(
    body: WatchCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Create a new repeating watch."""
    from app.models.forum import ForumConfig
    from sqlalchemy import select

    # Validate config exists
    cfg = (await db.execute(
        select(ForumConfig).where(ForumConfig.id == body.config_id)
    )).scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="Forum config not found")

    try:
        svc = RepeatingJobService(db)
        rj = await svc.create(
            job_type=body.job_type,
            config_id=body.config_id,
            interval_seconds=body.interval_seconds,
            label=body.label,
        )
        await db.commit()
        return rj
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{watch_id}/toggle", response_model=WatchResponse)
async def toggle_watch(
    watch_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Toggle a watch between active and paused."""
    svc = RepeatingJobService(db)
    rj = await svc.get(watch_id)
    if not rj:
        raise HTTPException(status_code=404, detail="Watch not found")
    result = await svc.set_active(watch_id, not rj.is_active)
    await db.commit()
    return result


@router.patch("/{watch_id}/interval", response_model=WatchResponse)
async def update_interval(
    watch_id: int,
    body: WatchUpdateInterval,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Update the repeat interval of a watch (live reschedule)."""
    svc = RepeatingJobService(db)
    result = await svc.update_interval(watch_id, body.interval_seconds)
    if not result:
        raise HTTPException(status_code=404, detail="Watch not found")
    await db.commit()
    return result


@router.delete("/{watch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_watch(
    watch_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete a watch and remove it from the scheduler."""
    svc = RepeatingJobService(db)
    deleted = await svc.delete(watch_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Watch not found")
    await db.commit()
