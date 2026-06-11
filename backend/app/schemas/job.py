"""
Pydantic schemas for job management.
"""

from datetime import datetime
from pydantic import BaseModel, Field
from app.models.job import JobType, JobStatus, LogLevel


class JobCreate(BaseModel):
    """Schema for creating a new job."""
    job_type: JobType
    config_id: int
    max_pages: int | None = Field(default=None, ge=1, description="Override max pages for this job")


class JobResponse(BaseModel):
    """Schema for job response."""
    id: int
    job_type: str
    status: str
    config_id: int | None
    parent_job_id: int | None = None
    phase: str | None = None
    total_items: int
    processed_items: int
    failed_items: int
    error_message: str | None
    progress: float = 0.0
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    """Paginated job list — top-level (parent/standalone) jobs only."""
    items: list[JobResponse]
    total: int
    page: int
    per_page: int


class JobLogResponse(BaseModel):
    """Schema for a job log entry."""
    id: int
    level: str
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


class JobDetailResponse(BaseModel):
    """Job with its logs."""
    job: JobResponse
    logs: list[JobLogResponse]


# --- Dashboard Schemas ---

class DashboardStats(BaseModel):
    """Dashboard statistics."""
    total_threads: int
    total_posts: int
    total_jobs: int
    active_jobs: int
    completed_jobs: int
    failed_jobs: int
    success_rate: float


class ActivityPoint(BaseModel):
    """A single data point for activity chart."""
    date: str
    threads: int
    posts: int


class RecentJobResponse(BaseModel):
    """Recent job for dashboard."""
    id: int
    job_type: str
    status: str
    processed_items: int
    total_items: int
    created_at: datetime

    model_config = {"from_attributes": True}
