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
    """
    Capture an authenticated screenshot of the forum section page.

    Flow:
      1. Load saved cookies from DB → inject into Playwright context
      2. Navigate to the forum section; check if logged in via page content
      3. If NOT logged in → use Playwright to do a real browser login
         (handles JS challenges / Cloudflare that trip up plain httpx)
      4. After login, collect ALL browser cookies → save to DB
      5. Take and return the screenshot
    """
    import json
    import logging
    from fastapi import HTTPException, Response
    from app.models.forum import ForumConfig
    from app.scraper.xenforo_auth import is_logged_in

    _log = logging.getLogger(__name__)

    # Guard: Playwright must be installed
    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail=(
                "Screenshot feature is unavailable: Playwright is not installed. "
                "Add 'playwright' to requirements.txt and run 'playwright install chromium'."
            ),
        )

    # Load forum config
    result = await db.execute(select(ForumConfig).limit(1))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(
            status_code=404,
            detail="No forum configuration found. Please add one in Settings first.",
        )

    if not config.xf_username or not config.xf_password_encrypted:
        raise HTTPException(
            status_code=400,
            detail="No forum credentials configured. Please set username and password in Settings.",
        )

    target_url = (
        config.forum_section_url
        or config.forum_url
        or "https://altenens.is/forums/accounts-and-database-dumps.45/"
    )
    base_url = config.forum_url.rstrip("/")
    domain = target_url.split("/")[2]        # e.g. "altenens.is"
    cookie_domain = f".{domain}"

    # ── Helper: persist browser cookies back to the DB ─────────────────────
    async def _save_browser_cookies(context):
        """Collect all cookies from a Playwright context and save to DB."""
        raw_cookies = await context.cookies()
        # Convert Playwright cookie list → simple {name: value} dict for storage
        cookie_map = {c["name"]: c["value"] for c in raw_cookies if c.get("name")}
        config.session_cookies = json.dumps(cookie_map)
        await db.commit()
        _log.info(f"Saved {len(cookie_map)} cookies to DB after Playwright session.")
        return cookie_map

    # ── Helper: build Playwright cookie list from stored dict ───────────────
    def _build_cookie_list(cookie_map: dict) -> list:
        return [
            {"name": k, "value": v, "domain": cookie_domain, "path": "/"}
            for k, v in cookie_map.items()
            if k and v
        ]

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
            )

            # ── Step 1: inject saved cookies (if any) ──────────────────────
            saved_cookies: dict = {}
            if config.session_cookies:
                try:
                    saved_cookies = json.loads(config.session_cookies) or {}
                except Exception:
                    saved_cookies = {}

            if saved_cookies:
                await context.add_cookies(_build_cookie_list(saved_cookies))
                _log.info(f"Injected {len(saved_cookies)} saved cookies into Playwright context.")

            page = await context.new_page()

            # ── Step 2: navigate to target and check login state ───────────
            await page.goto(target_url, timeout=40000, wait_until="domcontentloaded")
            page_html = await page.content()
            already_logged_in = is_logged_in(page_html)

            # ── Step 3: Playwright-based login if needed ───────────────────
            if not already_logged_in:
                _log.info("Session stale or missing — performing Playwright browser login.")

                # Go to login page
                await page.goto(f"{base_url}/login/", timeout=30000, wait_until="domcontentloaded")

                # Wait for the login form to appear
                try:
                    await page.wait_for_selector("input[name='login']", timeout=10000)
                except PWTimeout:
                    # Dump a debug screenshot to logs and fail
                    _log.error("Login form did not appear — forum may be serving a challenge page.")
                    raise HTTPException(
                        status_code=502,
                        detail="Login form did not load. The forum may be blocking automated access.",
                    )

                # Fill credentials
                await page.fill("input[name='login']", config.xf_username)
                await page.fill("input[name='password']", config.xf_password_encrypted)

                # Tick "Stay logged in" if it's there
                try:
                    remember_cb = page.locator("input[name='remember']")
                    if await remember_cb.count() > 0:
                        await remember_cb.check()
                except Exception:
                    pass

                # Submit the login form — use specific selector to avoid hitting
                # the hidden search button which also matches button[type='submit']
                try:
                    # Most specific: the login button inside the login form
                    login_btn = page.locator("form[action='/login/login'] button[type='submit']").first
                    await login_btn.click(timeout=10000)
                except Exception:
                    # Fallback: just press Enter from the password field
                    await page.press("input[name='password']", "Enter")


                # Wait for redirect away from /login/ (success) or stay (failure)
                try:
                    await page.wait_for_url(
                        lambda u: "/login/" not in u,
                        timeout=15000,
                    )
                except PWTimeout:
                    # Could be 2FA, CAPTCHA, or wrong credentials
                    error_el = await page.query_selector(".blockMessage--error, .p-body-pageContent .error")
                    error_text = (await error_el.inner_text()).strip() if error_el else "Unknown error"
                    _log.error(f"Login did not redirect — possible bad credentials or 2FA: {error_text}")
                    raise HTTPException(
                        status_code=401,
                        detail=f"Forum login failed: {error_text}",
                    )

                # Verify we are now logged in
                post_login_html = await page.content()
                if not is_logged_in(post_login_html):
                    raise HTTPException(
                        status_code=401,
                        detail="Login appeared to succeed but the forum still shows guest view.",
                    )

                _log.info("Playwright login successful!")

                # ── Step 4: save ALL cookies from this authenticated session ──
                await _save_browser_cookies(context)

                # Navigate to the actual target page now
                await page.goto(target_url, timeout=40000, wait_until="domcontentloaded")

            else:
                # Already logged in with saved cookies — refresh them anyway
                _log.info("Session still valid (using saved cookies).")
                await _save_browser_cookies(context)

            # ── Step 5: take the screenshot ────────────────────────────────
            # Wait briefly for any lazy-loaded content
            await page.wait_for_timeout(1500)
            screenshot = await page.screenshot(full_page=False)
            await browser.close()

            return Response(content=screenshot, media_type="image/png")

    except HTTPException:
        raise
    except Exception as e:
        _log.error(f"Screenshot failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to capture screenshot: {str(e)}")


