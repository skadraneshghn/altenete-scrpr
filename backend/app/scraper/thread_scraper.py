"""
Thread scraper - extracts the first post content from individual threads.
"""

import asyncio
import logging
from scrapling.fetchers import StealthyFetcher
from app.scraper.parsers import parse_first_post, PostData

logger = logging.getLogger(__name__)


class ThreadScraper:
    """Scrape first post content from individual thread pages."""

    def __init__(self, base_url: str, delay: float = 2.0):
        self.base_url = base_url.rstrip("/")
        self.delay = delay

    def _build_thread_url(self, thread_url: str) -> str:
        """Build full thread URL."""
        if thread_url.startswith("http"):
            return thread_url
        return f"{self.base_url}{thread_url}"

    async def scrape_thread(self, thread_url: str) -> PostData | None:
        """
        Scrape the first post from a thread.

        Args:
            thread_url: URL or path to the thread

        Returns:
            PostData or None if failed
        """
        full_url = self._build_thread_url(thread_url)
        logger.info(f"Scraping thread: {full_url}")

        try:
            page = StealthyFetcher.fetch(
                full_url,
                headless=True,
                network_idle=True,
            )

            if not page:
                logger.error(f"Failed to fetch thread: {full_url}")
                return None

            post_data = parse_first_post(page)
            if post_data:
                logger.info(f"Successfully scraped first post from {full_url}")
            else:
                logger.warning(f"No first post found at {full_url}")

            return post_data

        except Exception as e:
            logger.error(f"Error scraping thread {full_url}: {e}")
            return None

    async def scrape_batch(
        self,
        thread_urls: list[str],
        max_concurrent: int = 3,
        on_thread_complete=None,
        check_cancelled=None,
    ) -> dict[str, PostData | None]:
        """
        Scrape multiple threads with concurrency control.

        Args:
            thread_urls: List of thread URLs to scrape
            max_concurrent: Max parallel scrapes
            on_thread_complete: Callback(url, success, index, total)
            check_cancelled: Async callback returning True if should stop

        Returns:
            Dict mapping thread_url -> PostData or None
        """
        results = {}
        semaphore = asyncio.Semaphore(max_concurrent)
        total = len(thread_urls)

        async def _scrape_with_semaphore(url: str, index: int):
            async with semaphore:
                if check_cancelled and await check_cancelled():
                    return

                post = await self.scrape_thread(url)
                results[url] = post

                if on_thread_complete:
                    await on_thread_complete(url, post is not None, index, total)

                # Rate limiting
                await asyncio.sleep(self.delay)

        # Process sequentially to respect rate limits
        for i, url in enumerate(thread_urls):
            if check_cancelled and await check_cancelled():
                break
            await _scrape_with_semaphore(url, i)

        return results
