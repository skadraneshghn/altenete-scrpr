"""
Main scraper engine - orchestrates authentication, crawling, and scraping.
"""

import asyncio
import logging
import random
from datetime import datetime, timezone
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.database import AsyncSessionLocal
from app.models.forum import ForumConfig, Thread, Post
from app.models.job import Job, JobStatus, LogLevel
from app.services.job_service import JobService
from app.scraper.xenforo_auth import XenForoAuth
from app.scraper.forum_crawler import ForumCrawler
from app.scraper.thread_scraper import ThreadScraper
from app.police import DuplicatePolice, ThreadOperation, PostOperation

logger = logging.getLogger(__name__)


class ScraperEngine:
    """Main orchestrator for the scraping pipeline."""

    def __init__(self, job_id: int, config_id: int):
        self.job_id = job_id
        self.config_id = config_id
        self._cancelled = False

    async def run(self):
        """Execute the complete scraping pipeline."""
        async with AsyncSessionLocal() as db:
            job_service = JobService(db)

            try:
                # Load config
                result = await db.execute(
                    select(ForumConfig).where(ForumConfig.id == self.config_id)
                )
                config = result.scalar_one_or_none()
                if not config:
                    await job_service.update_status(
                        self.job_id, JobStatus.FAILED, "Forum config not found"
                    )
                    return

                # Update job to running
                await job_service.update_status(self.job_id, JobStatus.RUNNING)
                await job_service.add_log(
                    self.job_id, LogLevel.INFO,
                    f"Starting scrape job for {config.name}"
                )
                await db.commit()

                # Define standard log callback that writes directly to the job's database logs
                async def log_callback(message: str, level: str = "info"):
                    db_level = LogLevel.INFO
                    if level == "error":
                        db_level = LogLevel.ERROR
                    elif level == "warning":
                        db_level = LogLevel.WARNING
                    
                    await job_service.add_log(self.job_id, db_level, message)
                    await db.commit()

                # Initialize auth handler with session cookies persistence callback
                async def on_session_refreshed(new_cookies):
                    logger.info("Session cookies updated, persisting to database...")
                    cfg_res = await db.execute(select(ForumConfig).where(ForumConfig.id == config.id))
                    cfg = cfg_res.scalar_one()
                    cfg.session_cookies = json.dumps(new_cookies)
                    await db.flush()
                    await db.commit()

                auth = XenForoAuth(
                    base_url=config.forum_url,
                    username=config.xf_username,
                    password=config.xf_password_encrypted,
                    on_session_refreshed=on_session_refreshed,
                    logger_cb=log_callback
                )

                # Load existing cookies from DB
                if config.session_cookies:
                    try:
                        auth._cookies = json.loads(config.session_cookies)
                        auth._is_authenticated = True
                        await job_service.add_log(
                            self.job_id, LogLevel.INFO,
                            "Loaded existing forum session cookies from database."
                        )
                    except Exception as e:
                        logger.warning(f"Failed to parse saved session cookies: {e}")

                # If no valid session cookies, perform login with retries
                if not auth.is_authenticated:
                    max_retries = 3
                    login_success = False
                    for attempt in range(1, max_retries + 1):
                        try:
                            await job_service.add_log(
                                self.job_id, LogLevel.INFO,
                                f"No active session. Attempting forum login (Attempt {attempt}/{max_retries})...."
                            )
                            await auth.login()
                            login_success = True
                            break
                        except Exception as login_err:
                            await job_service.add_log(
                                self.job_id, LogLevel.WARNING,
                                f"Login attempt {attempt} failed: {login_err}"
                            )
                            if attempt < max_retries:
                                await asyncio.sleep(5)
                    
                    if not login_success:
                        raise Exception("Failed to authenticate with XenForo after multiple attempts.")

                # Determine job type
                result = await db.execute(select(Job).where(Job.id == self.job_id))
                job = result.scalar_one()

                if job.job_type in ("crawl_forum", "full_run"):
                    await self._crawl_forum(db, config, job_service, auth, log_callback)

                if job.job_type == "check_new":
                    await self._check_new_threads(db, config, job_service, auth, log_callback)

                if job.job_type in ("scrape_threads", "full_run"):
                    await self._scrape_threads(db, config, job_service, auth, log_callback)

                if job.job_type == "scrape_posts":
                    await self._scrape_posts(db, config, job_service, auth, log_callback)

                # Check if cancelled
                if await job_service.is_cancelled(self.job_id):
                    await job_service.add_log(
                        self.job_id, LogLevel.WARNING, "Job was cancelled"
                    )
                else:
                    await job_service.update_status(self.job_id, JobStatus.COMPLETED)
                    await job_service.add_log(
                        self.job_id, LogLevel.INFO, "Job completed successfully"
                    )

                await db.commit()

            except Exception as e:
                logger.error(f"Scraper engine error: {e}", exc_info=True)
                await job_service.update_status(
                    self.job_id, JobStatus.FAILED, str(e)
                )
                await job_service.add_log(
                    self.job_id, LogLevel.ERROR, f"Fatal error: {str(e)}"
                )
                await db.commit()

    async def _crawl_forum(self, db: AsyncSession, config: ForumConfig, job_service: JobService, auth: XenForoAuth, log_callback):
        """Phase 1: Crawl forum pages to discover threads."""
        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Phase 1: Crawling forum pages from {config.forum_section_url}"
        )
        await db.commit()

        crawler = ForumCrawler(
            base_url=config.forum_url,
            forum_section_url=config.forum_section_url,
            max_pages=config.max_pages,
            delay=config.scrape_delay,
            auth=auth,
            logger_cb=log_callback,
        )

        total_threads_found = 0

        async def on_page_complete(page_num, total_pages, threads_found):
            nonlocal total_threads_found
            total_threads_found += threads_found
            await job_service.update_progress(
                self.job_id,
                processed=page_num,
                total=total_pages,
            )
            await job_service.add_log(
                self.job_id, LogLevel.INFO,
                f"Page {page_num}/{total_pages}: found {threads_found} threads"
            )
            await db.commit()

        async def check_cancelled():
            return await job_service.is_cancelled(self.job_id)

        # Run the crawl
        threads_data = await crawler.crawl_all(
            on_page_complete=on_page_complete,
            check_cancelled=check_cancelled,
        )

        # Save threads to database — Police-guarded upsert
        police = DuplicatePolice(db, log_callback)
        saved_count = 0
        skipped_count = 0
        for td in threads_data:
            try:
                async def _save_thread(td=td):
                    """Upsert one thread row (called only when Police says ALLOW)."""
                    existing = await db.execute(
                        select(Thread).where(Thread.thread_xf_id == td.thread_xf_id)
                    )
                    thread = existing.scalar_one_or_none()
                    if thread:
                        # Update existing metadata
                        thread.title = td.title
                        thread.author = td.author
                        thread.replies = td.replies
                        thread.views = td.views
                        thread.is_sticky = td.is_sticky
                        thread.is_multipage = td.is_multipage
                        thread.max_pages = td.max_pages
                    else:
                        db.add(Thread(
                            thread_xf_id=td.thread_xf_id,
                            title=td.title,
                            url=td.url,
                            author=td.author,
                            replies=td.replies,
                            views=td.views,
                            is_sticky=td.is_sticky,
                            thread_date=td.thread_date,
                            is_multipage=td.is_multipage,
                            max_pages=td.max_pages,
                            config_id=config.id,
                            job_id=self.job_id,
                        ))
                    return True

                op = ThreadOperation(thread_xf_id=td.thread_xf_id, save_fn=_save_thread)
                result = await op.run(police)
                if result.skipped:
                    skipped_count += 1
                elif result.success:
                    saved_count += 1
                else:
                    logger.warning("Thread op failed: %s", result.message)
            except Exception as e:
                logger.warning(f"Error saving thread {td.thread_xf_id}: {e}")

        await db.flush()
        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Phase 1 complete: saved {saved_count} new/updated threads, {skipped_count} skipped (already indexed)"
        )
        await db.commit()

    async def _check_new_threads(self, db: AsyncSession, config: ForumConfig, job_service: JobService, auth: XenForoAuth, log_callback):
        """Quick Check: Crawl page 1 of the forum section to find and index new threads."""
        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Checking page 1 of forum: {config.forum_section_url} for new threads"
        )
        await db.commit()

        crawler = ForumCrawler(
            base_url=config.forum_url,
            forum_section_url=config.forum_section_url,
            max_pages=1,
            delay=config.scrape_delay,
            auth=auth,
            logger_cb=log_callback,
        )

        async def on_page_complete(page_num, total_pages, threads_found):
            await job_service.update_progress(
                self.job_id,
                processed=page_num,
                total=total_pages,
            )
            await db.commit()

        async def check_cancelled():
            return await job_service.is_cancelled(self.job_id)

        # Run the crawl for page 1
        threads_data = await crawler.crawl_all(
            on_page_complete=on_page_complete,
            check_cancelled=check_cancelled,
        )

        new_count = 0
        total_found = len(threads_data)
        police = DuplicatePolice(db, log_callback)

        for td in threads_data:
            try:
                async def _save_new_thread(td=td):
                    """Insert a brand-new thread (called only when Police says ALLOW)."""
                    db.add(Thread(
                        thread_xf_id=td.thread_xf_id,
                        title=td.title,
                        url=td.url,
                        author=td.author,
                        replies=td.replies,
                        views=td.views,
                        is_sticky=td.is_sticky,
                        thread_date=td.thread_date,
                        is_multipage=td.is_multipage,
                        max_pages=td.max_pages,
                        config_id=config.id,
                        job_id=self.job_id,
                    ))
                    return True

                op = ThreadOperation(thread_xf_id=td.thread_xf_id, save_fn=_save_new_thread)
                result = await op.run(police)

                if result.success:
                    new_count += 1
                    await job_service.add_log(
                        self.job_id, LogLevel.INFO,
                        f"Found and indexed new topic: '{td.title}'"
                    )
                elif result.skipped:
                    # Still refresh the cached stats even though Police skipped the insert
                    existing = await db.execute(
                        select(Thread).where(Thread.thread_xf_id == td.thread_xf_id)
                    )
                    thread = existing.scalar_one_or_none()
                    if thread:
                        thread.title = td.title
                        thread.author = td.author
                        thread.replies = td.replies
                        thread.views = td.views
                        thread.is_sticky = td.is_sticky
                        thread.is_multipage = td.is_multipage
                        thread.max_pages = td.max_pages
            except Exception as e:
                logger.warning(f"Error saving/updating thread {td.thread_xf_id}: {e}")

        await db.flush()
        
        if new_count > 0:
            await job_service.add_log(
                self.job_id, LogLevel.INFO,
                f"Completed check: Discovered and indexed {new_count} new topic(s) out of {total_found} total topics on page 1."
            )
        else:
            await job_service.add_log(
                self.job_id, LogLevel.INFO,
                f"Completed check: No new topics found on page 1 (checked {total_found} topics, all already indexed)."
            )
            
        # Update progress items info
        await job_service.update_progress(
            self.job_id,
            processed=new_count,
            total=total_found
        )
        await db.commit()

    async def _scrape_threads(self, db: AsyncSession, config: ForumConfig, job_service: JobService, auth: XenForoAuth, log_callback):
        """Phase 2: Scrape first post from each thread."""
        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            "Phase 2: Scraping first post from each thread"
        )
        await db.commit()

        # Get threads that don't have posts yet
        result = await db.execute(
            select(Thread).where(
                Thread.config_id == config.id,
                ~Thread.id.in_(select(Post.thread_id))
            )
        )
        threads = result.scalars().all()
        total = len(threads)

        await job_service.update_progress(self.job_id, processed=0, total=total)
        await db.commit()

        scraper = ThreadScraper(
            base_url=config.forum_url,
            delay=config.scrape_delay,
            auth=auth,
            logger_cb=log_callback,
        )

        processed = 0
        failed = 0
        skipped = 0
        police = DuplicatePolice(db, log_callback)

        for thread in threads:
            # Check cancellation
            if await job_service.is_cancelled(self.job_id):
                break

            scraped_content = None

            async def _scrape_and_save(thread=thread):
                """Scrape + persist the post (called only when Police says ALLOW)."""
                nonlocal scraped_content
                post_data = await scraper.scrape_thread(
                    thread.url,
                    max_pages=thread.max_pages if thread.is_multipage else 1
                )
                if not post_data:
                    return False
                db.add(Post(
                    thread_id=thread.id,
                    content_html=post_data.content_html,
                    content_text=post_data.content_text,
                    author=post_data.author,
                    post_date=post_data.post_date,
                ))
                scraped_content = post_data.content_text
                return True

            op = PostOperation(
                thread_id=thread.id,
                scrape_fn=_scrape_and_save,
                thread_label=thread.title[:80],
            )
            result = await op.run(police)

            if result.skipped:
                skipped += 1
            elif result.success:
                processed += 1
                # Telegram notification (fire-and-forget)
                try:
                    from app.services.telegram_service import telegram_bot_manager
                    asyncio.create_task(telegram_bot_manager.send_new_thread_notification(thread, scraped_content))
                except Exception as tg_err:
                    logger.error(f"Telegram notification error: {tg_err}")
                # Card extraction (fire-and-forget, only if post content was scraped)
                if scraped_content:
                    try:
                        from app.extractor.card_service import process_post as _cp
                        asyncio.create_task(_cp(
                            thread_id=thread.id,
                            thread_xf_id=thread.thread_xf_id,
                            thread_title=thread.title,
                            thread_url=thread.url,
                            author=thread.author,
                            content_text=scraped_content,
                        ))
                    except Exception as ce:
                        logger.error(f"Card extraction dispatch error: {ce}")
            else:
                failed += 1
                await job_service.add_log(
                    self.job_id, LogLevel.WARNING,
                    f"Failed to scrape thread: {thread.title} ({thread.url})"
                )

            await job_service.update_progress(
                self.job_id,
                processed=processed + failed + skipped,
                total=total,
                failed=failed,
            )
            await db.commit()

            # Rate limiting
            # Add random jitter between 75% and 125% of delay to bypass CDN bot detection
            jitter = config.scrape_delay * random.uniform(0.75, 1.25)
            await asyncio.sleep(jitter)

        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Phase 2 complete: scraped {processed} posts, {skipped} skipped (Police), {failed} failed"
        )
        await db.commit()

    async def _scrape_posts(self, db: AsyncSession, config: ForumConfig, job_service: JobService, auth: XenForoAuth, log_callback):
        """
        Dedicated "Scrape Posts" operation.

        Targets ALL indexed threads that do not yet have a first post stored.
        Uses first_post_only=True so only a single HTTP request per thread is
        made (no multi-page traversal) — extremely efficient.
        """
        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            "Scrape Posts: targeting all indexed threads without a stored first post"
        )
        await db.commit()

        # All threads for this forum config that have no Post yet
        result = await db.execute(
            select(Thread).where(
                Thread.config_id == config.id,
                ~Thread.id.in_(select(Post.thread_id))
            ).order_by(Thread.scraped_at.desc())
        )
        threads = result.scalars().all()
        total = len(threads)

        if total == 0:
            await job_service.add_log(
                self.job_id, LogLevel.INFO,
                "Scrape Posts: all indexed threads already have a first post — nothing to do."
            )
            await job_service.update_progress(self.job_id, processed=0, total=0)
            await db.commit()
            return

        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Scrape Posts: {total} threads need their first post extracted"
        )
        await job_service.update_progress(self.job_id, processed=0, total=total)
        await db.commit()

        scraper = ThreadScraper(
            base_url=config.forum_url,
            delay=config.scrape_delay,
            auth=auth,
            logger_cb=log_callback,
        )

        processed = 0
        failed = 0
        skipped = 0
        police = DuplicatePolice(db, log_callback)

        for thread in threads:
            # Check cancellation
            if await job_service.is_cancelled(self.job_id):
                await job_service.add_log(
                    self.job_id, LogLevel.WARNING, "Scrape Posts cancelled by user."
                )
                break

            await job_service.add_log(
                self.job_id, LogLevel.INFO,
                f"Extracting first post: [{thread.thread_xf_id}] {thread.title[:80]}"
            )

            scraped_content = None

            async def _scrape_first_post(thread=thread):
                """Fetch first post only (called only when Police says ALLOW)."""
                nonlocal scraped_content
                post_data = await scraper.scrape_thread(
                    thread.url,
                    first_post_only=True,  # only page 1, only post #1
                )
                if not post_data:
                    return False
                db.add(Post(
                    thread_id=thread.id,
                    content_html=post_data.content_html,
                    content_text=post_data.content_text,
                    author=post_data.author,
                    post_date=post_data.post_date,
                ))
                scraped_content = post_data.content_text
                return True

            op = PostOperation(
                thread_id=thread.id,
                scrape_fn=_scrape_first_post,
                thread_label=f"[{thread.thread_xf_id}] {thread.title[:60]}",
            )
            result = await op.run(police)

            if result.skipped:
                skipped += 1
            elif result.success:
                processed += 1
                # Telegram notification (fire-and-forget)
                try:
                    from app.services.telegram_service import telegram_bot_manager
                    asyncio.create_task(telegram_bot_manager.send_new_thread_notification(thread, scraped_content))
                except Exception as tg_err:
                    logger.error(f"Telegram notification error: {tg_err}")
                # Card extraction (fire-and-forget)
                if scraped_content:
                    try:
                        from app.extractor.card_service import process_post as _cp
                        asyncio.create_task(_cp(
                            thread_id=thread.id,
                            thread_xf_id=thread.thread_xf_id,
                            thread_title=thread.title,
                            thread_url=thread.url,
                            author=thread.author,
                            content_text=scraped_content,
                        ))
                    except Exception as ce:
                        logger.error(f"Card extraction dispatch error: {ce}")
            else:
                failed += 1
                await job_service.add_log(
                    self.job_id, LogLevel.WARNING,
                    f"Failed to extract first post from: {thread.url}"
                )

            await job_service.update_progress(
                self.job_id,
                processed=processed + failed + skipped,
                total=total,
                failed=failed,
            )
            await db.commit()

            # Respectful rate-limiting with jitter
            jitter = config.scrape_delay * random.uniform(0.75, 1.25)
            await asyncio.sleep(jitter)

        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Scrape Posts complete: {processed} first posts saved, {skipped} skipped (Police), {failed} failed"
        )
        await db.commit()
