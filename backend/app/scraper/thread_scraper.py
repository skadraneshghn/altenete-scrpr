"""
Thread scraper - extracts the first post content from individual threads.
Uses httpx for fetching — no browser/native binaries required.
"""

import asyncio
import logging
from app.scraper.http_client import get_client
from app.scraper.parsers import parse_first_post, PostData
from app.scraper.xenforo_auth import XenForoAuth

logger = logging.getLogger(__name__)


class ThreadScraper:
    """Scrape first post content from individual thread pages."""

    def __init__(self, base_url: str, delay: float = 2.0, auth: XenForoAuth | None = None, cookies: dict | None = None, logger_cb = None):
        self.base_url = base_url.rstrip("/")
        self.delay = delay
        self.auth = auth
        self.cookies = cookies or (auth._cookies if auth else {})
        self.logger_cb = logger_cb

    async def log(self, msg: str, level: str = "info"):
        if self.logger_cb:
            try:
                await self.logger_cb(msg, level)
            except Exception:
                pass

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
            if self.auth:
                html = await self.auth.fetch_with_retry(full_url)
            else:
                client = get_client()
                resp = await client.get(full_url, cookies=self.cookies)
                resp.raise_for_status()
                html = resp.text

            try:
                post_data = parse_first_post(html)
                if post_data:
                    logger.info(f"Successfully scraped first post from {full_url}")
                else:
                    msg = f"No first post content found at {full_url}"
                    logger.warning(msg)
                    await self.log(msg, "warning")
                return post_data
            except Exception as parse_err:
                msg = f"Error parsing thread post content for {full_url}: {parse_err}"
                logger.error(msg, exc_info=True)
                await self.log(msg, "error")
                return None

        except Exception as e:
            msg = f"Error scraping thread {full_url}: {e}"
            logger.error(msg)
            await self.log(msg, "error")
            return None

    async def scrape_batch(
        self,
        thread_urls: list[str],
        max_concurrent: int = 3,
        on_thread_complete=None,
        check_cancelled=None,
    ) -> dict[str, PostData | None]:
        """
        Scrape multiple threads sequentially (or with concurrency limit) respecting rate limits.

        Args:
            thread_urls: List of thread URLs to scrape
            max_concurrent: Max parallel scrapes (unused since we do sequential to respect delay)
            on_thread_complete: Callback(url, success, index, total)
            check_cancelled: Async callback returning True if should stop

        Returns:
            Dict mapping thread_url -> PostData or None
        """
        results = {}
        total = len(thread_urls)

        for i, url in enumerate(thread_urls):
            if check_cancelled and await check_cancelled():
                logger.info("Batch scraping cancelled")
                break

            post = await self.scrape_thread(url)
            results[url] = post

            if on_thread_complete:
                await on_thread_complete(url, post is not None, i, total)

            # Rate limiting
            if i < total - 1:
                await asyncio.sleep(self.delay)

        return results
