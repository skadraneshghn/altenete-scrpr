"""
Telegram Bot Engine — Background poll loop and message dispatcher.
Telegram-friendly: respects rate limits (429), uses a message queue with
retry-after back-off, and applies exponential delays on repeated errors.
Requires no external libraries, built entirely on top of HTTPX.
"""

import asyncio
import logging
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import select, update

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.telegram_settings import TelegramSettings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Telegram API limits reference
#   • Global:  30 messages / second
#   • Per-chat: 1 message / second (sustained), burst up to ~20
#   • Group:   20 messages / minute
# We are conservative and throttle to ~25 msg/s globally.
# ---------------------------------------------------------------------------
_GLOBAL_SEND_INTERVAL = 0.04   # ~25 msg/s global minimum gap
_CHAT_SEND_INTERVAL   = 1.0    # 1 msg/s per chat (safe sustained rate)
_MAX_RETRY_AFTER      = 3600   # never sleep longer than 1 hour for a 429
_MAX_SEND_RETRIES     = 3      # maximum send attempts per message


@dataclass(order=True)
class _QueuedMessage:
    """A message waiting to be sent, with priority and retry metadata."""
    priority: int                           # lower = higher priority
    chat_id: str        = field(compare=False)
    text: str           = field(compare=False)
    parse_mode: str     = field(compare=False, default="Markdown")
    attempts: int       = field(compare=False, default=0)
    future: Optional[asyncio.Future] = field(compare=False, default=None)


class TelegramRateLimiter:
    """
    Tracks per-chat and global send timestamps so we never violate
    Telegram's rate limits before we even get a 429 back.
    """

    def __init__(self):
        self._global_last_send: float = 0.0
        self._chat_last_send: Dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, chat_id: str) -> None:
        """Wait until it is safe to send to `chat_id`."""
        async with self._lock:
            now = time.monotonic()

            # Global throttle
            global_wait = _GLOBAL_SEND_INTERVAL - (now - self._global_last_send)
            if global_wait > 0:
                await asyncio.sleep(global_wait)
                now = time.monotonic()

            # Per-chat throttle
            chat_wait = _CHAT_SEND_INTERVAL - (now - self._chat_last_send.get(chat_id, 0))
            if chat_wait > 0:
                await asyncio.sleep(chat_wait)
                now = time.monotonic()

            self._global_last_send = now
            self._chat_last_send[chat_id] = now

    def update_flood_wait(self, chat_id: str, retry_after: int) -> None:
        """Record a flood-wait so the next acquire() skips the right amount."""
        wait = min(retry_after, _MAX_RETRY_AFTER)
        future_time = time.monotonic() + wait
        # Both global and per-chat cooldowns should honour the flood wait
        self._global_last_send = max(self._global_last_send, future_time)
        self._chat_last_send[chat_id] = max(
            self._chat_last_send.get(chat_id, 0), future_time
        )
        logger.warning(
            "Telegram flood-wait: chat_id=%s, retry_after=%ds — "
            "pausing that chat for %d seconds.",
            chat_id, retry_after, wait,
        )


class TelegramBotManager:
    """Manages the background Telegram polling task and sending notifications."""

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._sender_task: asyncio.Task | None = None
        self._running = False
        self._current_token: str | None = None
        self._http_client: httpx.AsyncClient | None = None
        self._rate_limiter = TelegramRateLimiter()

        # Priority queue: notifications are low-priority (1), commands high (0)
        self._send_queue: asyncio.PriorityQueue = asyncio.PriorityQueue()

    # ------------------------------------------------------------------
    # Settings helpers
    # ------------------------------------------------------------------

    async def get_effective_settings(self) -> Dict[str, Any]:
        """Get combined settings from Database and Env overrides."""
        settings = get_settings()
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(TelegramSettings).where(TelegramSettings.id == 1))
            db_settings = result.scalar_one_or_none()

            # Seed default settings row if it doesn't exist
            if not db_settings:
                default_enabled = bool(settings.TELEGRAM_BOT_TOKEN)
                db_settings = TelegramSettings(id=1, enabled=default_enabled)
                db.add(db_settings)
                await db.commit()
                await db.refresh(db_settings)

            # Auto-enable if env bot token is present and the bot has never run/been enabled
            if not db_settings.enabled and settings.TELEGRAM_BOT_TOKEN:
                if db_settings.bot_username is None and db_settings.last_error is None:
                    db_settings.enabled = True
                    await db.commit()
                    await db.refresh(db_settings)

            token = db_settings.bot_token_override or settings.TELEGRAM_BOT_TOKEN
            admin_id = db_settings.admin_chat_id_override or settings.TELEGRAM_ADMIN_CHAT_ID

            return {
                "enabled": db_settings.enabled,
                "bot_token": token,
                "admin_chat_id": admin_id,
                "watch_enabled": db_settings.watch_enabled,
                "message_template": db_settings.message_template,
                "bot_username": db_settings.bot_username,
                "bot_status": db_settings.bot_status,
                "last_error": db_settings.last_error,
            }

    async def update_settings(self, data: Dict[str, Any]) -> TelegramSettings:
        """Update Telegram configuration in the database."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(TelegramSettings).where(TelegramSettings.id == 1))
            db_settings = result.scalar_one_or_none()
            if not db_settings:
                db_settings = TelegramSettings(id=1)
                db.add(db_settings)

            for key, val in data.items():
                if hasattr(db_settings, key):
                    setattr(db_settings, key, val)

            await db.commit()
            await db.refresh(db_settings)

            # Restart or reload polling task if token/status changed
            if db_settings.enabled and self._running:
                await self.restart()
            elif not db_settings.enabled and self._running:
                await self.stop()
            elif db_settings.enabled and not self._running:
                await self.start()

            return db_settings

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self):
        """Start the background poll loop and sender tasks."""
        if self._running:
            return
        self._running = True
        self._http_client = httpx.AsyncClient(timeout=30.0)
        self._task = asyncio.create_task(self._poll_loop())
        self._sender_task = asyncio.create_task(self._sender_loop())
        logger.info("Telegram Bot service started")

    async def stop(self):
        """Stop the background poll loop and sender tasks."""
        self._running = False
        for task in (self._task, self._sender_task):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._task = None
        self._sender_task = None
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
        logger.info("Telegram Bot service stopped")

        # Update status in DB to Stopped
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(TelegramSettings)
                .where(TelegramSettings.id == 1)
                .values(bot_status="Stopped")
            )
            await db.commit()

    async def restart(self):
        """Stop and restart the bot loop."""
        await self.stop()
        await self.start()

    async def _update_db_status(self, status: str, username: str | None = None, error: str | None = None):
        """Helper to update runtime status fields in DB."""
        async with AsyncSessionLocal() as db:
            vals = {"bot_status": status, "last_error": error}
            if username is not None:
                vals["bot_username"] = username
            await db.execute(
                update(TelegramSettings)
                .where(TelegramSettings.id == 1)
                .values(**vals)
            )
            await db.commit()

    # ------------------------------------------------------------------
    # Core send primitive (used ONLY by the sender loop)
    # ------------------------------------------------------------------

    async def _do_send(
        self,
        token: str,
        chat_id: str,
        text: str,
        parse_mode: str = "Markdown",
    ) -> bool:
        """
        Low-level send to Telegram API.

        Returns True on success.
        Raises a RateLimitError when we get a 429 so the caller can requeue.
        """
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": False,
        }

        client = self._http_client or httpx.AsyncClient(timeout=10.0)
        res = await client.post(url, json=payload)

        if res.status_code == 200:
            return True

        data = {}
        try:
            data = res.json()
        except Exception:
            pass

        # ----- 429 Too Many Requests -----
        if res.status_code == 429:
            retry_after: int = data.get("parameters", {}).get("retry_after", 30)
            retry_after = min(int(retry_after), _MAX_RETRY_AFTER)
            self._rate_limiter.update_flood_wait(chat_id, retry_after)
            raise _FloodWaitError(retry_after)

        # ----- Markdown parse error → retry as plain text -----
        err_desc = data.get("description", "")
        if "can't parse" in err_desc and parse_mode != "":
            logger.info("Markdown send failed for chat %s, retrying as plain text.", chat_id)
            payload.pop("parse_mode", None)
            res2 = await client.post(url, json=payload)
            if res2.status_code == 200:
                return True
            if res2.status_code == 429:
                retry_after = res2.json().get("parameters", {}).get("retry_after", 30)
                retry_after = min(int(retry_after), _MAX_RETRY_AFTER)
                self._rate_limiter.update_flood_wait(chat_id, retry_after)
                raise _FloodWaitError(retry_after)

        logger.error("Telegram API Error: %s - %s", res.status_code, res.text)
        return False

    # ------------------------------------------------------------------
    # Sender loop — drains the priority queue in a rate-limit-aware way
    # ------------------------------------------------------------------

    async def _sender_loop(self):
        """
        Dedicated background coroutine that drains _send_queue.
        Respects rate limits and re-queues messages on flood-wait.
        """
        logger.info("Telegram sender loop started.")
        while self._running:
            try:
                msg: _QueuedMessage = await asyncio.wait_for(
                    self._send_queue.get(), timeout=1.0
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            cfg = await self.get_effective_settings()
            token = cfg.get("bot_token")
            if not token:
                # Drop the message — no token configured
                if msg.future and not msg.future.done():
                    msg.future.set_result(False)
                continue

            try:
                # Honour per-chat and global rate limits BEFORE sending
                await self._rate_limiter.acquire(msg.chat_id)

                msg.attempts += 1
                success = await self._do_send(token, msg.chat_id, msg.text, msg.parse_mode)

                if msg.future and not msg.future.done():
                    msg.future.set_result(success)

            except _FloodWaitError as fwe:
                if msg.attempts < _MAX_SEND_RETRIES:
                    logger.warning(
                        "Re-queuing message to chat %s after flood-wait of %ds "
                        "(attempt %d/%d).",
                        msg.chat_id, fwe.retry_after, msg.attempts, _MAX_SEND_RETRIES,
                    )
                    # Re-queue; rate_limiter already recorded the flood-wait
                    # so the next acquire() will sleep the right amount.
                    await self._send_queue.put(msg)
                else:
                    logger.error(
                        "Giving up on message to chat %s after %d attempts "
                        "(last flood-wait %ds).",
                        msg.chat_id, msg.attempts, fwe.retry_after,
                    )
                    if msg.future and not msg.future.done():
                        msg.future.set_result(False)

            except asyncio.CancelledError:
                # Put the message back so it is not lost on restart
                if msg.attempts < _MAX_SEND_RETRIES:
                    await self._send_queue.put(msg)
                break

            except Exception as exc:
                logger.error("Unexpected error sending Telegram message: %s", exc)
                if msg.future and not msg.future.done():
                    msg.future.set_result(False)

        logger.info("Telegram sender loop stopped.")

    # ------------------------------------------------------------------
    # Public send API
    # ------------------------------------------------------------------

    async def send_message(
        self,
        chat_id: str,
        text: str,
        parse_mode: str = "Markdown",
        priority: int = 0,
        wait: bool = True,
    ) -> bool:
        """
        Enqueue a message to be sent.  Returns True on success.

        Args:
            chat_id:    Telegram chat / user id.
            text:       Message body.
            parse_mode: 'Markdown', 'HTML', or '' for plain text.
            priority:   Lower number = sent sooner (0 = command replies,
                        1 = notifications, 2 = bulk/background).
            wait:       If True, block until the message is delivered (or fails).
                        If False, fire-and-forget — returns True immediately.
        """
        loop = asyncio.get_event_loop()
        future: asyncio.Future = loop.create_future()

        msg = _QueuedMessage(
            priority=priority,
            chat_id=chat_id,
            text=text,
            parse_mode=parse_mode,
            future=future,
        )
        await self._send_queue.put(msg)

        if wait:
            try:
                return await asyncio.wait_for(future, timeout=120.0)
            except asyncio.TimeoutError:
                logger.warning("Timed out waiting for message delivery to %s.", chat_id)
                return False
        return True

    # ------------------------------------------------------------------
    # Notification helpers
    # ------------------------------------------------------------------

    async def send_new_thread_notification(self, thread: Any, post_content: str | None = None):
        """Format and send a notification when a new thread/post is discovered."""
        cfg = await self.get_effective_settings()
        if not cfg["enabled"] or not cfg["watch_enabled"]:
            return

        admin_id = cfg["admin_chat_id"]
        if not admin_id:
            logger.warning(
                "Telegram Bot is enabled but Admin Chat ID is not configured. "
                "Notification skipped."
            )
            return

        # Prepare formatting arguments
        preview = post_content or ""
        if len(preview) > 500:
            preview = preview[:500] + "..."

        scraped_str = (
            thread.scraped_at.strftime("%Y-%m-%d %H:%M:%S")
            if thread.scraped_at
            else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        )

        def esc(val):
            if not val:
                return "—"
            for c in ["*", "_", "`", "["]:
                val = val.replace(c, "")
            return val

        msg = cfg["message_template"].format(
            title=esc(thread.title),
            author=esc(thread.author or "Anonymous"),
            url=thread.url,
            content=preview or "No content scraped yet.",
            scraped_at=scraped_str,
        )

        # Notifications are low-priority; fire-and-forget so we don't block scrapers
        await self.send_message(admin_id, msg, priority=1, wait=False)

    # ------------------------------------------------------------------
    # Command handler
    # ------------------------------------------------------------------

    async def _handle_command(self, message: Dict[str, Any], admin_id: str | None):
        """Process commands from users interacting with the Telegram Bot."""
        chat_id = str(message["chat"]["id"])
        text = message.get("text", "").strip()
        user_name = message.get("from", {}).get("first_name", "Admin")

        # If admin_id is not set yet, the first person to send /start claims admin access!
        if not admin_id and text.startswith("/start"):
            await self.update_settings({"admin_chat_id_override": chat_id})
            admin_id = chat_id
            await self.send_message(
                chat_id,
                f"👋 Hello {user_name}!\n\n"
                f"You have been successfully registered as the Scraper Bot Admin (Chat ID: `{chat_id}`).\n\n"
                f"Commands available:\n"
                f"⚡ `/watch` - Start sending new post notifications\n"
                f"⏸️ `/stop` - Stop sending notifications\n"
                f"📊 `/status` - Check current scraper status",
                priority=0,
            )
            return

        # Restrict commands to the configured Admin ID
        if str(chat_id) != str(admin_id):
            await self.send_message(
                chat_id,
                "⚠️ Access Denied: You are not configured as the Administrator of this system.",
                priority=0,
            )
            return

        if text.startswith("/start") or text.startswith("/watch"):
            await self.update_settings({"watch_enabled": True})
            await self.send_message(
                chat_id,
                "🔔 *Watch Mode Enabled!*\n\n"
                "You will now receive instant Telegram notifications whenever a new thread or post is scraped.",
                priority=0,
            )
        elif text.startswith("/stop"):
            await self.update_settings({"watch_enabled": False})
            await self.send_message(
                chat_id,
                "⏸️ *Watch Mode Paused.*\n\n"
                "Notifications have been disabled. Send `/watch` or `/start` to turn them back on.",
                priority=0,
            )
        elif text.startswith("/status"):
            from sqlalchemy import func
            from app.models.forum import Thread, Post
            from app.models.job import Job

            async with AsyncSessionLocal() as db:
                threads_count = (await db.execute(select(func.count(Thread.id)))).scalar() or 0
                posts_count = (await db.execute(select(func.count(Post.id)))).scalar() or 0
                jobs_count = (await db.execute(select(func.count(Job.id)))).scalar() or 0

            effective_cfg = await self.get_effective_settings()
            watch_status = "Active 🟢" if effective_cfg["watch_enabled"] else "Paused ⏸️"

            status_text = (
                f"📊 *Altenete Scraper Status*:\n\n"
                f"• *Telegram Watcher:* {watch_status}\n"
                f"• *Total Crawled Threads:* {threads_count}\n"
                f"• *Total Scraped Posts:* {posts_count}\n"
                f"• *Scraping Jobs Fired:* {jobs_count}\n\n"
                f"Send `/stop` to temporarily pause notifications."
            )
            await self.send_message(chat_id, status_text, priority=0)
        else:
            await self.send_message(
                chat_id,
                "❓ Unknown command. Available: `/watch`, `/stop`, `/status`",
                priority=0,
            )

    # ------------------------------------------------------------------
    # Poll loop
    # ------------------------------------------------------------------

    async def _poll_loop(self):
        """
        Infinite background loop fetching messages from Telegram via getUpdates.
        Handles 429 flood-waits gracefully on the polling side as well.
        """
        offset = 0
        consecutive_errors = 0
        poll_flood_wait_until: float = 0.0  # monotonic time to resume polling after 429

        while self._running:
            try:
                # Honour any poll-level flood-wait
                now = time.monotonic()
                if now < poll_flood_wait_until:
                    sleep_for = poll_flood_wait_until - now
                    logger.info("Poll loop sleeping %.1fs due to flood-wait.", sleep_for)
                    await asyncio.sleep(sleep_for)

                cfg = await self.get_effective_settings()
                if not cfg["enabled"]:
                    await self._update_db_status("Disabled (Inactive)")
                    await asyncio.sleep(5.0)
                    continue

                token = cfg["bot_token"]
                if not token:
                    await self._update_db_status(
                        "Missing Token", error="Token is not set in Env or Admin Panel."
                    )
                    await asyncio.sleep(10.0)
                    continue

                # Fetch bot info on first run / token change to verify and store username
                if self._current_token != token:
                    self._current_token = token
                    offset = 0
                    logger.info("Initializing Telegram bot verification...")
                    res = await self._http_client.get(
                        f"https://api.telegram.org/bot{token}/getMe"
                    )

                    if res.status_code == 200:
                        bot_data = res.json()["result"]
                        username = bot_data["username"]
                        await self._update_db_status("Running", username=username, error=None)
                        logger.info("Verified Telegram bot: @%s", username)
                    elif res.status_code == 429:
                        retry_after = res.json().get("parameters", {}).get("retry_after", 60)
                        retry_after = min(int(retry_after), _MAX_RETRY_AFTER)
                        logger.warning(
                            "getMe returned 429 — sleeping %ds before retry.", retry_after
                        )
                        await self._update_db_status(
                            "Rate Limited",
                            error=f"Flood-wait {retry_after}s on getMe.",
                        )
                        await asyncio.sleep(retry_after)
                        self._current_token = None  # force re-verify after sleep
                        continue
                    else:
                        err_msg = res.json().get("description", "Invalid Token")
                        await self._update_db_status(
                            "Error", error=f"Verification failed: {err_msg}"
                        )
                        await asyncio.sleep(20.0)
                        continue

                # Poll updates (timeout=20s for long polling)
                url = f"https://api.telegram.org/bot{token}/getUpdates"
                params = {"offset": offset, "timeout": 20}

                res = await self._http_client.get(url, params=params, timeout=25.0)

                # ----- Handle 429 on getUpdates -----
                if res.status_code == 429:
                    data = {}
                    try:
                        data = res.json()
                    except Exception:
                        pass
                    retry_after = data.get("parameters", {}).get("retry_after", 60)
                    retry_after = min(int(retry_after), _MAX_RETRY_AFTER)
                    poll_flood_wait_until = time.monotonic() + retry_after
                    logger.warning(
                        "getUpdates returned 429 — pausing poll loop for %ds.", retry_after
                    )
                    await self._update_db_status(
                        "Rate Limited",
                        error=f"Telegram flood-wait: retry after {retry_after}s.",
                    )
                    consecutive_errors += 1
                    continue  # loop will sleep at top

                if res.status_code != 200:
                    raise Exception(f"getUpdates returned {res.status_code}: {res.text}")

                updates = res.json().get("result", [])
                for upd in updates:
                    offset = upd["update_id"] + 1
                    if "message" in upd:
                        await self._handle_command(upd["message"], cfg["admin_chat_id"])

                consecutive_errors = 0
                poll_flood_wait_until = 0.0
                await self._update_db_status("Running")
                await asyncio.sleep(0.5)

            except asyncio.CancelledError:
                break
            except Exception as e:
                consecutive_errors += 1
                tb = traceback.format_exc()
                logger.error("Error in Telegram bot poll loop: %s\n%s", e, tb)

                # Exponential back-off: 5s, 10s, 20s … capped at 60s
                delay = min(5.0 * (2 ** (consecutive_errors - 1)), 60.0)
                logger.info("Poll loop back-off: sleeping %.1fs.", delay)
                await self._update_db_status("Error", error=f"Connection error: {str(e)}")
                await asyncio.sleep(delay)


# ---------------------------------------------------------------------------
# Internal exception type
# ---------------------------------------------------------------------------

class _FloodWaitError(Exception):
    """Raised internally when the Telegram API returns a 429 with retry_after."""

    def __init__(self, retry_after: int):
        super().__init__(f"Flood wait {retry_after}s")
        self.retry_after = retry_after


# ---------------------------------------------------------------------------
# Global manager singleton
# ---------------------------------------------------------------------------

telegram_bot_manager = TelegramBotManager()
