"""
Thread scraper - extracts the first post content from individual threads.
Uses httpx for fetching — no browser/native binaries required.
"""

import asyncio
import logging
import random
from app.scraper.http_client import get_client
from app.scraper.parsers import parse_first_post, parse_all_posts_from_page, PostData
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

    async def scrape_thread(self, thread_url: str, max_pages: int = 1) -> PostData | None:
        """
        Scrape all posts (or first post if single page) from a thread.

        Args:
            thread_url: URL or path to the thread
            max_pages: Number of pages to scrape (for multipage threads)

        Returns:
            PostData or None if failed
        """
        full_url = self._build_thread_url(thread_url)
        all_posts = []
        actual_max_pages = min(max(1, max_pages), 50)  # Sane cap at 50 pages

        for p in range(1, actual_max_pages + 1):
            page_url = full_url if p == 1 else f"{full_url.rstrip('/')}/page-{p}"
            logger.info(f"Scraping thread page {p}/{actual_max_pages}: {page_url}")
            await self.log(f"Scraping page {p}/{actual_max_pages} of thread...")

            try:
                if self.auth:
                    html = await self.auth.fetch_with_retry(page_url)
                else:
                    client = get_client()
                    resp = await client.get(page_url, cookies=self.cookies)
                    resp.raise_for_status()
                    html = resp.text

                page_posts = parse_all_posts_from_page(html)
                if page_posts:
                    all_posts.extend(page_posts)
                    logger.info(f"Parsed {len(page_posts)} posts from page {p}")
                else:
                    logger.warning(f"No posts found on page {p}")

            except Exception as e:
                msg = f"Error scraping thread page {p} ({page_url}): {e}"
                logger.error(msg)
                await self.log(msg, "warning")
                if p == 1:
                    return None

            # Delay between pages
            if p < actual_max_pages:
                jitter = self.delay * random.uniform(0.75, 1.25)
                await asyncio.sleep(jitter)

        if not all_posts:
            return None

        # Consolidate posts: first post metadata is retained, others concatenated
        first_post = all_posts[0]
        
        consolidated_html_parts = []
        consolidated_text_parts = []

        for idx, p_data in enumerate(all_posts):
            p_num = idx + 1
            clean_date = p_data.post_date.strftime("%Y-%m-%d %H:%M:%S") if p_data.post_date else "Unknown Date"
            
            html_part = (
                f"<div class='post-entry' style='margin-bottom: 25px; border-bottom: 1px dashed #eee; padding-bottom: 15px;'>"
                f"  <div class='post-meta' style='font-size: 12px; color: #777; margin-bottom: 8px; font-weight: 500;'>"
                f"    <strong>Post #{p_num} by {p_data.author}</strong> &bull; {clean_date}"
                f"  </div>"
                f"  <div class='post-body'>{p_data.content_html}</div>"
                f"</div>"
            )
            text_part = f"--- Post #{p_num} by {p_data.author} on {clean_date} ---\n{p_data.content_text}\n"
            
            consolidated_html_parts.append(html_part)
            consolidated_text_parts.append(text_part)

        return PostData(
            content_html="".join(consolidated_html_parts),
            content_text="\n".join(consolidated_text_parts),
            author=first_post.author,
            post_date=first_post.post_date
        )

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
                # Add random jitter between 75% and 125% of self.delay to bypass CDN bot detection
                jitter = self.delay * random.uniform(0.75, 1.25)
                await asyncio.sleep(jitter)

        return results
