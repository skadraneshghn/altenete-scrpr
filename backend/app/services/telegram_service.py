"""
Telegram Bot Engine — Background poll loop and message dispatcher.
Requires no external libraries, built entirely on top of HTTPX.
"""

import asyncio
import logging
import traceback
from datetime import datetime, timezone
from typing import Dict, Any

import httpx
from sqlalchemy import select, update

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.telegram_settings import TelegramSettings

logger = logging.getLogger(__name__)


class TelegramBotManager:
    """Manages the background Telegram polling task and sending notifications."""

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._running = False
        self._current_token: str | None = None
        self._http_client: httpx.AsyncClient | None = None

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

    async def start(self):
        """Start the background poll loop task."""
        if self._running:
            return
        self._running = True
        self._http_client = httpx.AsyncClient(timeout=30.0)
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Telegram Bot service started")

    async def stop(self):
        """Stop the background poll loop task."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
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

    async def send_message(self, chat_id: str, text: str, parse_mode: str = "Markdown") -> bool:
        """Send a direct telegram message to the target chat_id."""
        cfg = await self.get_effective_settings()
        token = cfg["bot_token"]
        if not token:
            logger.warning("Cannot send Telegram message: Bot Token is not configured.")
            return False

        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": False
        }
        
        # Fallback to HTML/plain if Markdown parsing fails due to special chars
        try:
            client = self._http_client or httpx.AsyncClient(timeout=10.0)
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                return True
            
            # If Markdown parsing error, retry as plain text
            err_desc = res.json().get("description", "")
            if "can't parse" in err_desc:
                logger.info("Markdown send failed, retrying with plain text...")
                payload.pop("parse_mode", None)
                res = await client.post(url, json=payload)
                return res.status_code == 200
                
            logger.error(f"Telegram API Error: {res.status_code} - {res.text}")
            return False
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")
            return False

    async def send_new_thread_notification(self, thread: Any, post_content: str | None = None):
        """Format and send a notification when a new thread/post is discovered."""
        cfg = await self.get_effective_settings()
        if not cfg["enabled"] or not cfg["watch_enabled"]:
            return

        admin_id = cfg["admin_chat_id"]
        if not admin_id:
            logger.warning("Telegram Bot is enabled but Admin Chat ID is not configured. Notification skipped.")
            return

        # Prepare formatting arguments
        preview = post_content or ""
        if len(preview) > 500:
            preview = preview[:500] + "..."

        scraped_str = thread.scraped_at.strftime("%Y-%m-%d %H:%M:%S") if thread.scraped_at else datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Safely clean/format markdown values
        def esc(val):
            if not val:
                return "—"
            # Simple escape for markdown characters to prevent Telegram API errors
            for c in ['*', '_', '`', '[']:
                val = val.replace(c, '')
            return val

        msg = cfg["message_template"].format(
            title=esc(thread.title),
            author=esc(thread.author or "Anonymous"),
            url=thread.url,
            content=preview or "No content scraped yet.",
            scraped_at=scraped_str
        )

        await self.send_message(admin_id, msg)

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
                f"📊 `/status` - Check current scraper status"
            )
            return

        # Restrict commands to the configured Admin ID
        if str(chat_id) != str(admin_id):
            await self.send_message(chat_id, "⚠️ Access Denied: You are not configured as the Administrator of this system.")
            return

        if text.startswith("/start") or text.startswith("/watch"):
            await self.update_settings({"watch_enabled": True})
            await self.send_message(
                chat_id, 
                "🔔 *Watch Mode Enabled!*\n\n"
                "You will now receive instant Telegram notifications whenever a new thread or post is scraped."
            )
        elif text.startswith("/stop"):
            await self.update_settings({"watch_enabled": False})
            await self.send_message(
                chat_id, 
                "⏸️ *Watch Mode Paused.*\n\n"
                "Notifications have been disabled. Send `/watch` or `/start` to turn them back on."
            )
        elif text.startswith("/status"):
            # Fetch simple stats from DB
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
            await self.send_message(chat_id, status_text)
        else:
            await self.send_message(chat_id, "❓ Unknown command. Available: `/watch`, `/stop`, `/status`")

    async def _poll_loop(self):
        """Infinite background loop fetching messages from Telegram via getUpdates."""
        offset = 0
        consecutive_errors = 0

        while self._running:
            try:
                cfg = await self.get_effective_settings()
                if not cfg["enabled"]:
                    await self._update_db_status("Disabled (Inactive)")
                    await asyncio.sleep(5.0)
                    continue

                token = cfg["bot_token"]
                if not token:
                    await self._update_db_status("Missing Token", error="Token is not set in Env or Admin Panel.")
                    await asyncio.sleep(10.0)
                    continue

                # Fetch bot info on first run to verify token and store username
                if self._current_token != token:
                    self._current_token = token
                    offset = 0
                    logger.info("Initializing Telegram bot verification...")
                    res = await self._http_client.get(f"https://api.telegram.org/bot{token}/getMe")
                    
                    if res.status_code == 200:
                        bot_data = res.json()["result"]
                        username = bot_data["username"]
                        await self._update_db_status("Running", username=username, error=None)
                        logger.info(f"Verified Telegram bot: @{username}")
                    else:
                        err_msg = res.json().get("description", "Invalid Token")
                        await self._update_db_status("Error", error=f"Verification failed: {err_msg}")
                        await asyncio.sleep(20.0)
                        continue

                # Poll updates (timeout=20s for long polling)
                url = f"https://api.telegram.org/bot{token}/getUpdates"
                params = {"offset": offset, "timeout": 20}
                
                res = await self._http_client.get(url, params=params, timeout=25.0)
                if res.status_code != 200:
                    raise Exception(f"getUpdates returned {res.status_code}: {res.text}")

                updates = res.json().get("result", [])
                for update in updates:
                    offset = update["update_id"] + 1
                    if "message" in update:
                        await self._handle_command(update["message"], cfg["admin_chat_id"])

                consecutive_errors = 0
                await self._update_db_status("Running")
                await asyncio.sleep(0.5)

            except asyncio.CancelledError:
                break
            except Exception as e:
                consecutive_errors += 1
                tb = traceback.format_exc()
                logger.error(f"Error in Telegram bot poll loop: {e}\n{tb}")
                
                # Back-off delay if errors occur repeatedly
                delay = min(5.0 * consecutive_errors, 60.0)
                await self._update_db_status("Error", error=f"Connection error: {str(e)}")
                await asyncio.sleep(delay)


# Global manager singleton
telegram_bot_manager = TelegramBotManager()
