"""
Shared async HTTP client for the scraper engine.
Uses curl_cffi for advanced TLS fingerprint spoofing when available, falling back to httpx.
"""

import httpx
import logging
import random

logger = logging.getLogger(__name__)

# Try importing curl_cffi for TLS fingerprint impersonation
try:
    from curl_cffi.requests import AsyncSession
    HAS_CURL_CFFI = True
    logger.info("Anti-detection: curl_cffi package found and will be used for TLS fingerprint spoofing.")
except ImportError:
    HAS_CURL_CFFI = False
    logger.warning("Anti-detection: curl_cffi NOT found. Falling back to standard httpx. Anti-bot spoofing will be limited.")

# Modern browser configurations for headers rotating fallback
USER_AGENTS = [
    # Windows Chrome 125
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    },
    # Windows Edge 125
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
        "sec-ch-ua": '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    },
    # macOS Chrome 125
    {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
    },
    # Linux Chrome 125
    {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
    }
]

def get_random_browser_headers() -> dict:
    ua_info = random.choice(USER_AGENTS)
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Priority": "u=0, i",
    }
    headers.update(ua_info)
    return headers


class AntiBotAsyncClient:
    """Wrapper that abstracts curl_cffi AsyncSession and httpx.AsyncClient under a uniform interface."""

    def __init__(self):
        self.use_curl = HAS_CURL_CFFI
        self._is_closed = False
        
        if self.use_curl:
            # Impersonate Chrome 120 (spoofs TLS JA3, HTTP2 frames)
            self.session = AsyncSession(
                impersonate="chrome120",
                follow_redirects=True,
                timeout=30.0,
            )
        else:
            self.session = httpx.AsyncClient(
                headers=get_random_browser_headers(),
                follow_redirects=True,
                timeout=httpx.Timeout(30.0),
                limits=httpx.Limits(max_connections=5, max_keepalive_connections=3),
            )

    async def get(self, url: str, **kwargs):
        # Override headers with fresh browser details if using standard httpx
        if not self.use_curl and "headers" not in kwargs:
            kwargs["headers"] = get_random_browser_headers()
            
        # Convert timeout objects
        if self.use_curl and "timeout" in kwargs:
            t = kwargs["timeout"]
            if hasattr(t, "read"): # is httpx.Timeout
                kwargs["timeout"] = t.read or 30.0

        return await self.session.get(url, **kwargs)

    async def post(self, url: str, **kwargs):
        if not self.use_curl and "headers" not in kwargs:
            kwargs["headers"] = get_random_browser_headers()

        if self.use_curl and "timeout" in kwargs:
            t = kwargs["timeout"]
            if hasattr(t, "read"):
                kwargs["timeout"] = t.read or 30.0

        return await self.session.post(url, **kwargs)

    @property
    def cookies(self):
        return self.session.cookies

    @property
    def is_closed(self) -> bool:
        if self.use_curl:
            return self._is_closed
        return self.session.is_closed

    async def aclose(self):
        self._is_closed = True
        if self.use_curl:
            await self.session.close()
        else:
            await self.session.aclose()


# Singleton client instance
_client: AntiBotAsyncClient | None = None


def get_client() -> AntiBotAsyncClient:
    """Return (or create) the shared anti-detection client."""
    global _client
    if _client is None or _client.is_closed:
        _client = AntiBotAsyncClient()
    return _client


async def close_client():
    """Close the shared client on application shutdown."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
