"""
XenForo authentication handler using httpx.
Handles login flow with CSRF token extraction and self-healing session management.
"""

import re
import logging
from bs4 import BeautifulSoup
from app.scraper.http_client import get_client

logger = logging.getLogger(__name__)


def is_logged_in(html: str) -> bool:
    """Detect if the current HTML content indicates a logged-in XenForo session."""
    if not html:
        return False
    # If the page explicitly states logged in is true
    if 'data-logged-in="true"' in html:
        return True
    # If the page template is login, or logged-in status is false
    if 'data-logged-in="false"' in html or 'data-template="login"' in html:
        return False
    # If XenForo config sets userId to 0
    if 'userId: 0' in html or '"userId":0' in html or '"userId": 0' in html:
        return False
    # Explicit error message text check
    if 'must be logged-in' in html.lower() or 'must be logged in' in html.lower():
        return False
    # Check if a log out button or account details exist
    if '/logout/' in html or 'data-menu="menu"' in html:
        return True
    return True


class XenForoAuth:
    """Handle XenForo forum authentication using httpx."""

    def __init__(self, base_url: str, username: str, password: str, on_session_refreshed=None):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.on_session_refreshed = on_session_refreshed
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
        3. Verify login success by checking response cookies and HTML state
        """
        logger.info(f"Attempting login to {self.base_url} as {self.username}")

        try:
            from playwright.async_api import async_playwright, TimeoutError as PWTimeout
            logger.info("Using Playwright browser-based login for scraper session...")

            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-blink-features=AutomationControlled",
                    ],
                )
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/125.0.0.0 Safari/537.36"
                    ),
                )
                page = await context.new_page()

                # Navigate to login page
                login_url = f"{self.base_url}/login/"
                await page.goto(login_url, timeout=30000, wait_until="domcontentloaded")

                # Wait for login form
                try:
                    await page.wait_for_selector("input[name='login']", timeout=15000)
                except PWTimeout:
                    raise Exception("Login form did not load. The forum may be blocking automated access.")

                # Fill credentials
                await page.fill("input[name='login']", self.username)
                await page.fill("input[name='password']", self.password)

                # Tick "Stay logged in"
                try:
                    remember_cb = page.locator("input[name='remember']")
                    if await remember_cb.count() > 0:
                        await remember_cb.check()
                except Exception:
                    pass

                # Submit
                try:
                    login_btn = page.locator("form[action='/login/login'] button[type='submit']").first
                    await login_btn.click(timeout=10000)
                except Exception:
                    await page.press("input[name='password']", "Enter")

                # Wait for redirect
                try:
                    await page.wait_for_url(
                        lambda u: "/login/" not in u,
                        timeout=15000,
                    )
                except PWTimeout:
                    error_el = await page.query_selector(".blockMessage--error, .p-body-pageContent .error")
                    error_text = (await error_el.inner_text()).strip() if error_el else "Unknown error"
                    raise Exception(f"Login failed: {error_text}")

                # Verify we are logged in
                post_login_html = await page.content()
                if not is_logged_in(post_login_html):
                    raise Exception("Login appeared to succeed but page still shows guest view.")

                # Collect cookies
                raw_cookies = await context.cookies()
                self._cookies = {c["name"]: c["value"] for c in raw_cookies if c.get("name")}
                self._is_authenticated = True

                logger.info("XenForo login successful via Playwright!")
                await browser.close()

                # Fire the callback to save cookies to the database
                if self.on_session_refreshed:
                    try:
                        await self.on_session_refreshed(self._cookies)
                    except Exception as cb_err:
                        logger.error(f"Error executing session refresh callback: {cb_err}")

            return {"status": "authenticated", "cookies": self._cookies}

        except ImportError:
            logger.info("Playwright not installed, falling back to httpx-based login...")
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

                if login_resp.status_code >= 400:
                    raise Exception(f"HTTP error {login_resp.status_code} during POST login")

                # Combine initial page cookies with response cookies
                all_cookies = dict(login_resp.cookies)
                self._cookies = {**cookies, **all_cookies}

                # Check if login was successful
                if "xf_user" in self._cookies or is_logged_in(login_resp.text):
                    self._is_authenticated = True
                    logger.info("XenForo login successful!")
                    
                    # Fire the callback to save cookies to the database
                    if self.on_session_refreshed:
                        try:
                            await self.on_session_refreshed(self._cookies)
                        except Exception as cb_err:
                            logger.error(f"Error executing session refresh callback: {cb_err}")
                else:
                    # Try to detect error message
                    err_soup = BeautifulSoup(login_resp.text, "lxml")
                    error_el = err_soup.select_one(".blockMessage--error, .p-body-pageContent .error")
                    error_msg = error_el.get_text(strip=True) if error_el else "Unknown login credentials error"
                    raise Exception(f"Login failed: {error_msg}")

                return {"status": "authenticated", "cookies": self._cookies}

            except Exception as e:
                logger.error(f"XenForo authentication failed: {str(e)}")
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

    async def fetch_with_retry(self, url: str) -> str:
        """
        Fetch page using authenticated session.
        If not authenticated or session has expired (e.g. data-logged-in="false"),
        automatically log in and retry.
        """
        client = get_client()

        # Perform initial fetch
        logger.info(f"Fetching authenticated URL: {url}")
        resp = await client.get(url, cookies=self._cookies)
        resp.raise_for_status()
        html = resp.text

        # Validate session state
        if is_logged_in(html):
            return html

        logger.warning(f"Session expired or guest access returned for {url}. Initiating auto-login...")
        await self.login()

        # Retry request with new cookies
        logger.info(f"Retrying fetch with updated cookies for: {url}")
        resp = await client.get(url, cookies=self._cookies)
        resp.raise_for_status()
        html = resp.text

        if not is_logged_in(html):
            raise Exception("Session expired and auto-login retry did not restore authenticated session.")

        return html

    async def fetch_authenticated(self, url: str) -> str:
        """Backward compatibility helper."""
        return await self.fetch_with_retry(url)
