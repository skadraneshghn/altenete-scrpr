"""
HTML parsing helpers for XenForo forum pages.
Defines CSS selectors and extraction logic based on the forum's DOM structure.
"""

import re
import logging
from datetime import datetime, timezone
from dataclasses import dataclass, field

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


@dataclass
class PostData:
    """Parsed first post data from a thread page."""
    content_html: str = ""
    content_text: str = ""
    author: str = ""
    post_date: datetime | None = None


# --- CSS Selectors for XenForo 2.x ---

# Forum listing page
SELECTORS = {
    # Thread items (excluding sticky)
    "thread_item": ".structItem--thread",
    "thread_item_sticky": ".structItemContainer-group--sticky .structItem--thread",
    "thread_item_normal": ".structItemContainer-group.js-threadList .structItem--thread",

    # Thread metadata (within a thread item)
    "thread_title_link": ".structItem-title a[href*='/threads/']",
    "thread_author": ".structItem-parts .username",
    "thread_replies": ".structItem-cell--meta .pairs:first-child dd",
    "thread_views": ".structItem-cell--meta .pairs:last-child dd",
    "thread_date": ".structItem-startDate time",

    # Pagination
    "next_page": ".pageNav-jump--next",
    "last_page": ".pageNav-page:last-child a",
    "page_count": ".pageNavSimple-el--current",

    # Thread page - first post
    "first_post": ".message--post:first-child",
    "post_content": ".message-body .bbWrapper",
    "post_author": ".message-name a.username",
    "post_date": ".message-date time",
}


def parse_thread_id_from_url(url: str) -> str | None:
    """
    Extract thread XenForo ID from URL.
    URL format: /threads/some-title.12345/ → returns '12345'
    """
    match = re.search(r"/threads/[^/]*\.(\d+)/?", url)
    return match.group(1) if match else None


def parse_thread_id_from_element(element) -> str | None:
    """
    Extract thread ID from the structItem element.
    The element has class like 'js-threadListItem-12345'
    """
    try:
        classes = element.attrib.get("class", "")
        match = re.search(r"js-threadListItem-(\d+)", classes)
        return match.group(1) if match else None
    except Exception:
        return None


def parse_view_count(text: str) -> int:
    """Parse view/reply count text like '33K' or '151K' to integer."""
    text = text.strip().upper()
    if "K" in text:
        return int(float(text.replace("K", "")) * 1000)
    elif "M" in text:
        return int(float(text.replace("M", "")) * 1000000)
    try:
        return int(text.replace(",", ""))
    except ValueError:
        return 0


def parse_timestamp(element) -> datetime | None:
    """Parse timestamp from a time element's data-timestamp attribute."""
    try:
        ts = element.attrib.get("data-timestamp")
        if ts:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc)
        return None
    except Exception:
        return None


def parse_threads_from_page(page) -> list[ThreadData]:
    """
    Parse all threads from a forum listing page.

    Args:
        page: Scrapling page object

    Returns:
        List of ThreadData objects
    """
    threads = []

    # Get all thread items (both sticky and normal)
    thread_elements = page.css(SELECTORS["thread_item"])

    # Identify sticky thread IDs
    sticky_elements = page.css(SELECTORS["thread_item_sticky"])
    sticky_ids = set()
    for el in (sticky_elements or []):
        tid = parse_thread_id_from_element(el)
        if tid:
            sticky_ids.add(tid)

    for element in (thread_elements or []):
        try:
            # Get thread link
            title_link = element.css(SELECTORS["thread_title_link"])
            if not title_link:
                continue

            # Handle single vs list result
            if hasattr(title_link, '__iter__') and not isinstance(title_link, str):
                title_link = title_link[0] if title_link else None
            if not title_link:
                continue

            url = title_link.attrib.get("href", "")
            title = title_link.text or ""
            title = title.strip()

            # Parse thread ID
            thread_id = parse_thread_id_from_url(url) or parse_thread_id_from_element(element)
            if not thread_id:
                continue

            # Author
            author_el = element.css(SELECTORS["thread_author"])
            author = ""
            if author_el:
                if hasattr(author_el, '__iter__') and not isinstance(author_el, str):
                    author_el = author_el[0] if author_el else None
                author = (author_el.text or "").strip() if author_el else ""

            # Replies
            replies_el = element.css(SELECTORS["thread_replies"])
            replies = 0
            if replies_el:
                if hasattr(replies_el, '__iter__'):
                    replies_el = replies_el[0] if replies_el else None
                replies = parse_view_count(replies_el.text or "0") if replies_el else 0

            # Views
            views_el = element.css(SELECTORS["thread_views"])
            views = 0
            if views_el:
                if hasattr(views_el, '__iter__'):
                    views_el = views_el[0] if views_el else None
                views = parse_view_count(views_el.text or "0") if views_el else 0

            # Date
            date_el = element.css(SELECTORS["thread_date"])
            thread_date = None
            if date_el:
                if hasattr(date_el, '__iter__'):
                    date_el = date_el[0] if date_el else None
                thread_date = parse_timestamp(date_el) if date_el else None

            # Is sticky?
            is_sticky = thread_id in sticky_ids

            threads.append(ThreadData(
                thread_xf_id=thread_id,
                title=title,
                url=url,
                author=author,
                replies=replies,
                views=views,
                is_sticky=is_sticky,
                thread_date=thread_date,
            ))

        except Exception as e:
            logger.warning(f"Error parsing thread element: {e}")
            continue

    logger.info(f"Parsed {len(threads)} threads from page")
    return threads


def parse_total_pages(page) -> int:
    """Parse total page count from the pagination element."""
    try:
        # Try the simple page count text "1 of 54972"
        page_text_el = page.css(SELECTORS["page_count"])
        if page_text_el:
            if hasattr(page_text_el, '__iter__'):
                page_text_el = page_text_el[0]
            text = (page_text_el.text or "").strip()
            match = re.search(r"of\s+([\d,]+)", text)
            if match:
                return int(match.group(1).replace(",", ""))

        # Fallback: last page link
        last_page_el = page.css(SELECTORS["last_page"])
        if last_page_el:
            if hasattr(last_page_el, '__iter__'):
                last_page_el = last_page_el[-1]
            text = (last_page_el.text or "").strip()
            return int(text.replace(",", ""))

        return 1
    except Exception as e:
        logger.warning(f"Error parsing total pages: {e}")
        return 1


def parse_first_post(page) -> PostData | None:
    """
    Parse the first post from a thread page.

    Args:
        page: Scrapling page object for a thread

    Returns:
        PostData or None if not found
    """
    try:
        # Get the first post element
        first_post = page.css(SELECTORS["first_post"])
        if not first_post:
            # Fallback: try getting any message post
            first_post = page.css("article.message")
        if not first_post:
            return None

        if hasattr(first_post, '__iter__'):
            first_post = first_post[0]

        # Content
        content_el = first_post.css(SELECTORS["post_content"])
        if not content_el:
            content_el = first_post.css(".bbWrapper")

        content_html = ""
        content_text = ""
        if content_el:
            if hasattr(content_el, '__iter__'):
                content_el = content_el[0]
            content_html = str(content_el) if content_el else ""
            content_text = (content_el.text or "").strip() if content_el else ""

        # Author
        author_el = first_post.css(SELECTORS["post_author"])
        author = ""
        if author_el:
            if hasattr(author_el, '__iter__'):
                author_el = author_el[0]
            author = (author_el.text or "").strip()

        # Date
        date_el = first_post.css(SELECTORS["post_date"])
        post_date = None
        if date_el:
            if hasattr(date_el, '__iter__'):
                date_el = date_el[0]
            post_date = parse_timestamp(date_el)

        return PostData(
            content_html=content_html,
            content_text=content_text,
            author=author,
            post_date=post_date,
        )

    except Exception as e:
        logger.error(f"Error parsing first post: {e}")
        return None
