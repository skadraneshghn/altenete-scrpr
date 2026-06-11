"""
XenForo authentication handler using httpx.
Handles login flow with CSRF token extraction and session management.
No browser/Playwright/curl_cffi required.
"""

import re
import logging
from bs4 import BeautifulSoup
from app.scraper.http_client import get_client

logger = logging.getLogger(__name__)


class XenForoAuth:
    """Handle XenForo forum authentication using httpx."""

    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self._cookies: dict = {}
        self._is_authenticated = False

    @property
    def is_authenticated(self) -> bool:
        return self._is_authenticated

    async def login(self) -> dict:
        """
        Login to XenForo forum.

        Flow:
        1. GET /login/ to fetch the login page and extract _xfToken
        2. POST /login/login with credentials and CSRF token
        3. Verify login success by checking response cookies
        """
        logger.info(f"Attempting to login to {self.base_url} as {self.username}")
        client = get_client()

        try:
            # Step 1: Fetch login page to get CSRF token
            resp = await client.get(f"{self.base_url}/login/")
            resp.raise_for_status()

            soup = BeautifulSoup(resp.text, "lxml")
            xf_token = self._extract_csrf_token(soup, resp.text)
            if not xf_token:
                raise Exception("Could not extract _xfToken from login page")

            logger.info("CSRF token extracted successfully")

            # Collect cookies from the login page
            cookies = dict(resp.cookies)

            # Step 2: POST login form
            login_resp = await client.post(
                f"{self.base_url}/login/login",
                data={
                    "login": self.username,
                    "password": self.password,
                    "_xfToken": xf_token,
                    "remember": "1",
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": f"{self.base_url}/login/",
                    "Origin": self.base_url,
                },
                cookies=cookies,
            )

            # XenForo redirects to homepage on successful login
            all_cookies = dict(login_resp.cookies)
            self._cookies = {**cookies, **all_cookies}

            # Check for xf_user cookie (sign of success)
            if "xf_user" in self._cookies:
                self._is_authenticated = True
                logger.info("Login successful — xf_user cookie found")
            else:
                # Try to detect error message
                err_soup = BeautifulSoup(login_resp.text, "lxml")
                error_el = err_soup.select_one(".blockMessage--error, .p-body-pageContent .error")
                error_msg = error_el.get_text(strip=True) if error_el else "Unknown login error"
                raise Exception(f"Login failed: {error_msg}")

            return {"status": "authenticated", "cookies": self._cookies}

        except Exception as e:
            logger.error(f"Login failed: {str(e)}")
            self._is_authenticated = False
            raise

    def _extract_csrf_token(self, soup: BeautifulSoup, html: str) -> str | None:
        """Extract _xfToken from the login page."""
        # Hidden input field
        token_input = soup.find("input", {"name": "_xfToken"})
        if token_input and token_input.get("value"):
            return token_input["value"]

        # HTML tag data-csrf attribute
        html_tag = soup.find("html")
        if html_tag and html_tag.get("data-csrf"):
            return html_tag["data-csrf"]

        # Regex fallback
        match = re.search(r'data-csrf="([^"]+)"', html)
        if match:
            return match.group(1)

        return None

    async def fetch_authenticated(self, url: str) -> str:
        """Fetch a page using the authenticated session cookies."""
        if not self._is_authenticated:
            await self.login()

        client = get_client()
        resp = await client.get(url, cookies=self._cookies)
        resp.raise_for_status()
        return resp.text
