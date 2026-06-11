"""
Pydantic schemas for forum, thread, and post data.
"""

from datetime import datetime
from pydantic import BaseModel, Field


# --- ForumConfig Schemas ---

class ForumConfigCreate(BaseModel):
    """Schema for creating a forum configuration."""
    name: str = Field(..., max_length=255)
    forum_url: str = Field(..., max_length=500)
    forum_section_url: str = Field(..., max_length=500)
    xf_username: str = Field(..., max_length=255)
    xf_password: str = Field(..., max_length=255)
    max_pages: int = Field(default=0, ge=0)
    scrape_delay: float = Field(default=2.0, ge=0.5)


class ForumConfigUpdate(BaseModel):
    """Schema for updating a forum configuration."""
    name: str | None = None
    forum_url: str | None = None
    forum_section_url: str | None = None
    xf_username: str | None = None
    xf_password: str | None = None
    max_pages: int | None = None
    scrape_delay: float | None = None
    is_active: bool | None = None


class ForumConfigResponse(BaseModel):
    """Schema for forum config response."""
    id: int
    name: str
    forum_url: str
    forum_section_url: str
    xf_username: str
    max_pages: int
    scrape_delay: float
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Thread Schemas ---

class ThreadResponse(BaseModel):
    """Schema for thread response."""
    id: int
    thread_xf_id: str
    title: str
    author: str | None
    url: str
    replies: int
    views: int
    is_sticky: bool
    thread_date: datetime | None
    is_multipage: bool = False
    max_pages: int = 1
    scraped_at: datetime
    has_post: bool = False

    model_config = {"from_attributes": True}


class ThreadListResponse(BaseModel):
    """Paginated thread list."""
    items: list[ThreadResponse]
    total: int
    page: int
    per_page: int
    total_pages: int


# --- Post Schemas ---

class PostResponse(BaseModel):
    """Schema for post response."""
    id: int
    thread_id: int
    content_html: str | None
    content_text: str | None
    author: str | None
    post_date: datetime | None
    scraped_at: datetime

    model_config = {"from_attributes": True}


class ThreadDetailResponse(BaseModel):
    """Thread with its first post."""
    thread: ThreadResponse
    post: PostResponse | None
