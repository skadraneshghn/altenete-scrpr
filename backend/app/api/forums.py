"""
Forum data API endpoints: threads, posts, forum configs.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_

from app.database import get_db
from app.models.user import User
from app.models.forum import ForumConfig, Thread, Post
from app.schemas.forum import (
    ForumConfigCreate, ForumConfigUpdate, ForumConfigResponse,
    ThreadResponse, ThreadListResponse,
    PostResponse, ThreadDetailResponse,
)
from app.api.deps import get_current_user
from app.services.auth_service import hash_password

router = APIRouter(prefix="/api/forums", tags=["Forums"])


# --- Forum Configs ---

@router.get("/configs", response_model=list[ForumConfigResponse])
async def list_configs(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all forum configurations."""
    result = await db.execute(select(ForumConfig).order_by(desc(ForumConfig.created_at)))
    configs = result.scalars().all()
    return [ForumConfigResponse.model_validate(c) for c in configs]


@router.post("/configs", response_model=ForumConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_config(
    data: ForumConfigCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Create a new forum configuration."""
    config = ForumConfig(
        name=data.name,
        forum_url=data.forum_url,
        forum_section_url=data.forum_section_url,
        xf_username=data.xf_username,
        xf_password_encrypted=data.xf_password,  # In production, encrypt this
        max_pages=data.max_pages,
        scrape_delay=data.scrape_delay,
    )
    db.add(config)
    await db.flush()
    await db.refresh(config)
    return ForumConfigResponse.model_validate(config)


@router.put("/configs/{config_id}", response_model=ForumConfigResponse)
async def update_config(
    config_id: int,
    data: ForumConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Update a forum configuration."""
    result = await db.execute(select(ForumConfig).where(ForumConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    update_data = data.model_dump(exclude_unset=True)
    if "xf_password" in update_data:
        update_data["xf_password_encrypted"] = update_data.pop("xf_password")

    for key, value in update_data.items():
        setattr(config, key, value)

    await db.flush()
    await db.refresh(config)
    return ForumConfigResponse.model_validate(config)


@router.delete("/configs/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete a forum configuration."""
    result = await db.execute(select(ForumConfig).where(ForumConfig.id == config_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    await db.delete(config)


# --- Threads ---

@router.get("/threads", response_model=ThreadListResponse)
async def list_threads(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List scraped threads with pagination and search."""
    query = select(Thread)
    count_query = select(func.count(Thread.id))

    if search:
        search_filter = or_(
            Thread.title.ilike(f"%{search}%"),
            Thread.author.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = (total + per_page - 1) // per_page

    query = query.order_by(desc(Thread.scraped_at)).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    threads = result.scalars().all()

    items = []
    for t in threads:
        resp = ThreadResponse.model_validate(t)
        # Check if post exists
        post_result = await db.execute(select(func.count(Post.id)).where(Post.thread_id == t.id))
        resp.has_post = (post_result.scalar() or 0) > 0
        items.append(resp)

    return ThreadListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get thread with its first post content."""
    result = await db.execute(select(Thread).where(Thread.id == thread_id))
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    post_result = await db.execute(select(Post).where(Post.thread_id == thread.id))
    post = post_result.scalar_one_or_none()

    return ThreadDetailResponse(
        thread=ThreadResponse.model_validate(thread),
        post=PostResponse.model_validate(post) if post else None,
    )


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Delete a scraped thread and its post."""
    result = await db.execute(select(Thread).where(Thread.id == thread_id))
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    await db.delete(thread)
