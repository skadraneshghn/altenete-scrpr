"""
Main scraper engine - orchestrates authentication, crawling, and scraping.
"""

import asyncio
import logging
from datetime import datetime, timezone

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

                # Determine job type
                result = await db.execute(select(Job).where(Job.id == self.job_id))
                job = result.scalar_one()

                if job.job_type in ("crawl_forum", "full_run"):
                    await self._crawl_forum(db, config, job_service)

                if job.job_type in ("scrape_threads", "full_run"):
                    await self._scrape_threads(db, config, job_service)

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

    async def _crawl_forum(self, db: AsyncSession, config: ForumConfig, job_service: JobService):
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

        # Save threads to database (upsert)
        saved_count = 0
        for td in threads_data:
            try:
                # Check if thread already exists
                existing = await db.execute(
                    select(Thread).where(Thread.thread_xf_id == td.thread_xf_id)
                )
                thread = existing.scalar_one_or_none()

                if thread:
                    # Update existing
                    thread.title = td.title
                    thread.author = td.author
                    thread.replies = td.replies
                    thread.views = td.views
                    thread.is_sticky = td.is_sticky
                else:
                    # Create new
                    thread = Thread(
                        thread_xf_id=td.thread_xf_id,
                        title=td.title,
                        url=td.url,
                        author=td.author,
                        replies=td.replies,
                        views=td.views,
                        is_sticky=td.is_sticky,
                        thread_date=td.thread_date,
                        config_id=config.id,
                        job_id=self.job_id,
                    )
                    db.add(thread)

                saved_count += 1
            except Exception as e:
                logger.warning(f"Error saving thread {td.thread_xf_id}: {e}")

        await db.flush()
        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Phase 1 complete: saved {saved_count} threads to database"
        )
        await db.commit()

    async def _scrape_threads(self, db: AsyncSession, config: ForumConfig, job_service: JobService):
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
        )

        processed = 0
        failed = 0

        for thread in threads:
            # Check cancellation
            if await job_service.is_cancelled(self.job_id):
                break

            post_data = await scraper.scrape_thread(thread.url)

            if post_data:
                post = Post(
                    thread_id=thread.id,
                    content_html=post_data.content_html,
                    content_text=post_data.content_text,
                    author=post_data.author,
                    post_date=post_data.post_date,
                )
                db.add(post)
                processed += 1
            else:
                failed += 1
                await job_service.add_log(
                    self.job_id, LogLevel.WARNING,
                    f"Failed to scrape thread: {thread.title} ({thread.url})"
                )

            await job_service.update_progress(
                self.job_id,
                processed=processed + failed,
                total=total,
                failed=failed,
            )
            await db.commit()

            # Rate limiting
            await asyncio.sleep(config.scrape_delay)

        await job_service.add_log(
            self.job_id, LogLevel.INFO,
            f"Phase 2 complete: scraped {processed} posts, {failed} failed"
        )
        await db.commit()
