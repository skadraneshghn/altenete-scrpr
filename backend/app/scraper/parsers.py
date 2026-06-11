"""
HTML parsing helpers for XenForo forum pages.
Uses BeautifulSoup4 with lxml backend — pure Python, no native browser needed.
"""

import re
import logging
from datetime import datetime, timezone
from dataclasses import dataclass
from bs4 import BeautifulSoup, Tag

logger = logging.getLogger(__name__)


@dataclass
class ThreadData:
    """Parsed thread data from forum listing."""
    thread_xf_id: str
    title: str
    url: str
    author: str = ""
    replies: int = 0
    views: int = 0
    is_sticky: bool = False
    thread_date: datetime | None = None
    is_multipage: bool = False
    max_pages: int = 1


@dataclass
class PostData:
    """Parsed first post data from a thread page."""
    content_html: str = ""
    content_text: str = ""
    author: str = ""
    post_date: datetime | None = None


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def parse_thread_id_from_url(url: str) -> str | None:
    """Extract thread XenForo ID from URL like /threads/title.12345/"""
    match = re.search(r"/threads/[^/]*\.(\d+)/?", url)
    return match.group(1) if match else None


def parse_thread_id_from_element(element: Tag) -> str | None:
    """Extract thread ID from class like 'js-threadListItem-12345'"""
    try:
        classes = " ".join(element.get("class", []))
        match = re.search(r"js-threadListItem-(\d+)", classes)
        return match.group(1) if match else None
    except Exception:
        return None


def parse_view_count(text: str) -> int:
    """Parse view/reply count text like '33K' or '151K' to integer."""
    text = text.strip().upper()
    try:
        if "K" in text:
            return int(float(text.replace("K", "")) * 1000)
        elif "M" in text:
            return int(float(text.replace("M", "")) * 1_000_000)
        return int(text.replace(",", ""))
    except (ValueError, AttributeError):
        return 0


def parse_timestamp(element: Tag) -> datetime | None:
    """Parse timestamp from a <time> element's data-timestamp attribute."""
    try:
        ts = element.get("data-timestamp")
        if ts:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    except Exception:
        pass
    return None


def parse_threads_from_page(html: str) -> list[ThreadData]:
    """Parse all threads from a forum listing page HTML string."""
    soup = _soup(html)
    threads: list[ThreadData] = []

    # Identify sticky thread IDs
    sticky_ids: set[str] = set()
    sticky_container = soup.select(".structItemContainer-group--sticky .structItem--thread")
    for el in sticky_container:
        tid = parse_thread_id_from_element(el)
        if tid:
            sticky_ids.add(tid)

    thread_elements = soup.select(".structItem--thread")

    for element in thread_elements:
        try:
            title_link = element.select_one(".structItem-title a[href*='/threads/']")
            if not title_link:
                continue

            url = title_link.get("href", "")
            if url:
                url = url.split("#")[0].split("?")[0]
                if url.endswith("/unread"):
                    url = url[:-7]
                elif url.endswith("/unread/"):
                    url = url[:-8]
                if not url.endswith("/"):
                    url += "/"
            title = title_link.get_text(strip=True)

            thread_id = parse_thread_id_from_url(url) or parse_thread_id_from_element(element)
            if not thread_id:
                continue

            author_el = element.select_one(".structItem-parts .username")
            author = author_el.get_text(strip=True) if author_el else ""

            meta_pairs = element.select(".structItem-cell--meta .pairs dd")
            replies = parse_view_count(meta_pairs[0].get_text()) if len(meta_pairs) > 0 else 0
            views   = parse_view_count(meta_pairs[1].get_text()) if len(meta_pairs) > 1 else 0

            date_el = element.select_one(".structItem-startDate time")
            thread_date = parse_timestamp(date_el) if date_el else None

            is_sticky = thread_id in sticky_ids

            is_multipage = False
            max_pages = 1
            page_jump = element.select_one(".structItem-pageJump")
            if page_jump:
                is_multipage = True
                links = page_jump.select("a")
                if links:
                    try:
                        last_page_text = links[-1].get_text(strip=True)
                        max_pages = int(last_page_text.replace(",", ""))
                    except Exception:
                        max_pages = 1

            threads.append(ThreadData(
                thread_xf_id=thread_id,
                title=title,
                url=url,
                author=author,
                replies=replies,
                views=views,
                is_sticky=is_sticky,
                thread_date=thread_date,
                is_multipage=is_multipage,
                max_pages=max_pages,
            ))
        except Exception as e:
            logger.warning(f"Error parsing thread element: {e}")
            continue

    logger.info(f"Parsed {len(threads)} threads from page")
    return threads


def parse_total_pages(html: str) -> int:
    """Parse total page count from pagination HTML."""
    soup = _soup(html)
    try:
        # XenForo simple nav: "Page 1 of 54972"
        el = soup.select_one(".pageNavSimple-el--current")
        if el:
            match = re.search(r"of\s+([\d,]+)", el.get_text())
            if match:
                return int(match.group(1).replace(",", ""))

        # Fallback: last numbered page link
        page_links = soup.select(".pageNav-page a")
        if page_links:
            last = page_links[-1].get_text(strip=True)
            return int(last.replace(",", ""))
    except Exception as e:
        logger.warning(f"Error parsing total pages: {e}")
    return 1


def parse_first_post(html: str) -> PostData | None:
    """Parse the first post from a thread page HTML string."""
    soup = _soup(html)
    try:
        # Try first .message--post
        first_post = soup.select_one(".message--post")
        if not first_post:
            first_post = soup.select_one("article.message")
        if not first_post:
            return None

        content_el = first_post.select_one(".message-body .bbWrapper") or \
                     first_post.select_one(".bbWrapper")
        content_html = str(content_el) if content_el else ""
        content_text = content_el.get_text(separator="\n", strip=True) if content_el else ""

        # Extract author with backup options
        author = ""
        if first_post.get("data-author"):
            author = first_post.get("data-author")
        else:
            author_el = first_post.select_one(".message-name a.username") or \
                        first_post.select_one(".message-name")
            author = author_el.get_text(strip=True) if author_el else ""

        # Extract post date with backup selectors
        date_el = first_post.select_one(".message-date time") or \
                  first_post.select_one(".message-attribution time") or \
                  first_post.select_one("time.u-dt") or \
                  first_post.select_one("time")
        post_date = parse_timestamp(date_el) if date_el else None

        return PostData(
            content_html=content_html,
            content_text=content_text,
            author=author,
            post_date=post_date,
        )
    except Exception as e:
        logger.error(f"Error parsing first post: {e}")
        return None


def parse_all_posts_from_page(html: str) -> list[PostData]:
    """Parse all posts from a thread page HTML string."""
    soup = _soup(html)
    posts = []
    post_elements = soup.select(".message--post, article.message")
    for post_el in post_elements:
        try:
            content_el = post_el.select_one(".message-body .bbWrapper") or \
                         post_el.select_one(".bbWrapper")
            content_html = str(content_el) if content_el else ""
            content_text = content_el.get_text(separator="\n", strip=True) if content_el else ""

            author = ""
            if post_el.get("data-author"):
                author = post_el.get("data-author")
            else:
                author_el = post_el.select_one(".message-name a.username") or \
                            post_el.select_one(".message-name")
                author = author_el.get_text(strip=True) if author_el else ""

            date_el = post_el.select_one(".message-date time") or \
                      post_el.select_one(".message-attribution time") or \
                      post_el.select_one("time.u-dt") or \
                      post_el.select_one("time")
            post_date = parse_timestamp(date_el) if date_el else None

            if content_html or content_text:
                posts.append(PostData(
                    content_html=content_html,
                    content_text=content_text,
                    author=author,
                    post_date=post_date,
                ))
        except Exception as e:
            logger.warning(f"Error parsing post element: {e}")
    return posts
