"""
Shared async HTTP client for the scraper engine.
Uses httpx with realistic browser headers — no native binaries required.
"""

import httpx

# Shared client — reused across all scrapers (connection pooling)
_client: httpx.AsyncClient | None = None

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def get_client() -> httpx.AsyncClient:
    """Return (or create) the shared async HTTP client."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            headers=BROWSER_HEADERS,
            follow_redirects=True,
            timeout=httpx.Timeout(30.0),
            limits=httpx.Limits(max_connections=5, max_keepalive_connections=3),
        )
    return _client


async def close_client():
    """Close the shared client on app shutdown."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
