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


@router.get("/health-check")
async def health_check(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Test and return health check metrics for connection, session, database, and parsing parameters."""
    import time
    import json
    import re
    import httpx
    from app.models.forum import ForumConfig
    from app.scraper.xenforo_auth import is_logged_in
    from app.scraper.parsers import parse_threads_from_page

    # 1. Connection check
    connection_status = "error"
    latency_ms = None
    response_code = None
    target_url = "https://altenens.is"
    
    result = await db.execute(select(ForumConfig).limit(1))
    config = result.scalar_one_or_none()
    if config:
        target_url = config.forum_url
        
    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(target_url)
            latency_ms = round((time.time() - start_time) * 1000, 2)
            response_code = resp.status_code
            if resp.status_code < 400:
                connection_status = "healthy"
    except Exception as e:
        connection_status = f"unreachable ({str(e)})"

    # 2. Session / Cookie check
    session_status = "no_cookies"
    session_user = None
    session_uid = None
    if config and config.session_cookies:
        try:
            cookies = json.loads(config.session_cookies)
            if cookies:
                # Test using httpx with saved cookies
                async with httpx.AsyncClient(timeout=5.0) as client:
                    test_url = config.forum_section_url or f"{target_url}/forums/accounts-and-database-dumps.45/"
                    resp = await client.get(test_url, cookies=cookies)
                    if is_logged_in(resp.text):
                        session_status = "active"
                        uid_match = re.search(r'userId:\s*(\d+)', resp.text)
                        if uid_match:
                            session_uid = uid_match.group(1)
                        session_user = config.xf_username
                    else:
                        session_status = "expired"
        except Exception as e:
            session_status = f"error ({str(e)})"

    # 3. Database Stats
    threads_count = (await db.execute(select(func.count(Thread.id)))).scalar() or 0
    posts_count = (await db.execute(select(func.count(Post.id)))).scalar() or 0
    
    # 4. Parser health
    parser_status = "healthy"
    test_html = """
    <div class="structItem structItem--thread js-inlineModContainer js-threadListItem-12345">
        <div class="structItem-cell structItem-cell--main">
            <div class="structItem-title">
                <a href="/threads/test-thread.12345/">Test Thread Title</a>
            </div>
            <div class="structItem-minor">
                <ul class="structItem-parts">
                    <li><a href="/members/test.1/" class="username">TestAuthor</a></li>
                </ul>
            </div>
        </div>
    </div>
    """
    try:
        parsed_threads = parse_threads_from_page(test_html)
        if not parsed_threads or parsed_threads[0].thread_xf_id != "12345":
            parser_status = "broken"
    except Exception:
        parser_status = "broken"

    # 5. Last Job Run
    last_job = None
    job_result = await db.execute(
        select(Job).order_by(Job.created_at.desc()).limit(1)
    )
    job = job_result.scalar_one_or_none()
    if job:
        last_job = {
            "id": job.id,
            "job_type": job.job_type.value if hasattr(job.job_type, "value") else str(job.job_type),
            "status": job.status.value if hasattr(job.status, "value") else str(job.status),
            "error_message": job.error_message,
            "finished_at": job.completed_at.isoformat() if job.completed_at else None,
            "created_at": job.created_at.isoformat()
        }

    return {
        "connectivity": {
            "status": connection_status,
            "url": target_url,
            "latency_ms": latency_ms,
            "response_code": response_code
        },
        "session": {
            "status": session_status,
            "username": session_user,
            "user_id": session_uid
        },
        "database": {
            "threads_count": threads_count,
            "posts_count": posts_count
        },
        "parser": {
            "status": parser_status
        },
        "last_job": last_job
    }


@router.get("/screenshot")
async def get_screenshot(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Capture and return a real-time PNG screenshot of the forum section page."""
    import json
    from fastapi import HTTPException, Response
    from app.models.forum import ForumConfig

    # Guard against Playwright not being installed in this environment
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail=(
                "Screenshot feature is unavailable: Playwright is not installed. "
                "Add 'playwright' to requirements.txt and run 'playwright install chromium'."
            ),
        )

    # Find the active configuration
    result = await db.execute(select(ForumConfig).limit(1))
    config = result.scalar_one_or_none()
    if not config:
        url = "https://altenens.is/forums/accounts-and-database-dumps.45/"
        cookies_list = []
    else:
        url = config.forum_section_url or "https://altenens.is/forums/accounts-and-database-dumps.45/"
        cookies_list = []
        if config.session_cookies:
            try:
                cookies_dict = json.loads(config.session_cookies)
                for name, value in cookies_dict.items():
                    cookies_list.append({
                        "name": name,
                        "value": value,
                        "domain": ".altenens.is" if "altenens.is" in url else "localhost",
                        "path": "/"
                    })
            except Exception:
                pass

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                executable_path="/usr/bin/google-chrome",
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"]
            )
            context = await browser.new_context(viewport={"width": 1280, "height": 800})
            if cookies_list:
                await context.add_cookies(cookies_list)
            page = await context.new_page()
            await page.goto(url, timeout=30000, wait_until="load")
            screenshot = await page.screenshot(full_page=False)
            await browser.close()
            return Response(content=screenshot, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to capture screenshot: {str(e)}")
