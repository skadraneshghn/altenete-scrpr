"""
Forum page crawler - crawls forum listing pages and discovers thread URLs.
Uses httpx for fetching — no browser/native binaries required.
"""

import asyncio
import logging
from app.scraper.http_client import get_client
from app.scraper.parsers import parse_threads_from_page, parse_total_pages, ThreadData

logger = logging.getLogger(__name__)


class ForumCrawler:
    """Crawl forum listing pages to discover threads."""

    def __init__(
        self,
        base_url: str,
        forum_section_url: str,
        max_pages: int = 0,
        delay: float = 2.0,
        cookies: dict | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.forum_section_url = forum_section_url.rstrip("/")
        self.max_pages = max_pages  # 0 = all pages
        self.delay = delay
        self.cookies = cookies or {}
        self._cancelled = False

    def cancel(self):
        """Cancel the crawling operation."""
        self._cancelled = True

    def _build_page_url(self, page_num: int) -> str:
        """Build the URL for a specific page number."""
        if page_num == 1:
            return self.forum_section_url
        return f"{self.forum_section_url}/page-{page_num}"

    async def _fetch_html(self, url: str) -> str | None:
        """Fetch raw HTML for a URL."""
        client = get_client()
        try:
            resp = await client.get(url, cookies=self.cookies)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None

    async def crawl_page(self, page_num: int) -> list[ThreadData]:
        """
        Crawl a single forum listing page.

        Returns:
            List of ThreadData from that page
        """
        url = self._build_page_url(page_num)
        logger.info(f"Crawling page {page_num}: {url}")

        html = await self._fetch_html(url)
        if not html:
            return []

        threads = parse_threads_from_page(html)
        return threads

    async def get_total_pages(self) -> int:
        """Get the total number of pages in the forum section."""
        html = await self._fetch_html(self.forum_section_url)
        if html:
            return parse_total_pages(html)
        return 1

    async def crawl_all(
        self,
        on_page_complete=None,
        check_cancelled=None,
    ) -> list[ThreadData]:
        """
        Crawl all forum pages and collect thread data.

        Args:
            on_page_complete: async callback(page_num, total_pages, threads_found)
            check_cancelled: async callback that returns True if should stop

        Returns:
            Complete list of all discovered threads
        """
        all_threads: list[ThreadData] = []

        total_pages = await self.get_total_pages()
        if self.max_pages > 0:
            total_pages = min(total_pages, self.max_pages)

        logger.info(f"Starting crawl of {total_pages} pages from {self.forum_section_url}")

        for page_num in range(1, total_pages + 1):
            if self._cancelled:
                logger.info("Crawling cancelled")
                break
            if check_cancelled and await check_cancelled():
                logger.info("Crawling cancelled by external check")
                break

            threads = await self.crawl_page(page_num)
            all_threads.extend(threads)

            if on_page_complete:
                await on_page_complete(page_num, total_pages, len(threads))

            if page_num < total_pages:
                await asyncio.sleep(self.delay)

        logger.info(f"Crawling complete. Total threads discovered: {len(all_threads)}")
        return all_threads
