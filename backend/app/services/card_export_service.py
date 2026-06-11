"""
Card Export Service — manages daily Telegram dispatch of extracted card data.

- Reads CardExportSettings from MySQL to decide if export is enabled.
- Runs a background loop (APScheduler-style, pure asyncio) that triggers every 24h.
- When triggered: builds two in-memory text files and sends them to Telegram.
- Also handles an immediate send when the admin first enables the feature.
"""

import asyncio
import io
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.card_export_settings import CardExportSettings

logger = logging.getLogger(__name__)

_EXPORT_INTERVAL_SECONDS = 86_400  # 24 hours


class CardExportService:
    """Background service: daily export of card data files to Telegram."""

    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False

    # ── Settings helpers ──────────────────────────────────────────────────────

    async def get_settings(self) -> CardExportSettings:
        """Fetch (or seed) CardExportSettings row."""
        async with AsyncSessionLocal() as db:
            row = (await db.execute(
                select(CardExportSettings).where(CardExportSettings.id == 1)
            )).scalar_one_or_none()
            if not row:
                row = CardExportSettings(id=1, extractor_enabled=False, daily_export_enabled=False)
                db.add(row)
                await db.commit()
                await db.refresh(row)
            return row

    async def save_settings(self, extractor_enabled: bool, daily_export_enabled: bool) -> CardExportSettings:
        """Persist settings and (re)start / stop the background loop accordingly."""
        async with AsyncSessionLocal() as db:
            row = (await db.execute(
                select(CardExportSettings).where(CardExportSettings.id == 1)
            )).scalar_one_or_none()
            if not row:
                row = CardExportSettings(id=1)
                db.add(row)

            prev_export = row.daily_export_enabled
            row.extractor_enabled = extractor_enabled
            row.daily_export_enabled = daily_export_enabled
            await db.commit()
            await db.refresh(row)

        # If daily export was just turned on, send immediately then schedule
        if daily_export_enabled and not prev_export:
            logger.info("Card export just enabled — sending initial export now.")
            asyncio.create_task(self._send_export())

        if daily_export_enabled and not self._running:
            await self.start()
        elif not daily_export_enabled and self._running:
            await self.stop()

        return row

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._daily_loop())
        logger.info("Card daily export service started.")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Card daily export service stopped.")

    # ── Background loop ───────────────────────────────────────────────────────

    async def _daily_loop(self):
        """Wait 24 h between each export dispatch."""
        while self._running:
            try:
                await asyncio.sleep(_EXPORT_INTERVAL_SECONDS)
                cfg = await self.get_settings()
                if cfg.daily_export_enabled:
                    await self._send_export()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"Card export loop error: {exc}", exc_info=True)
                await asyncio.sleep(60)  # back-off on errors

    # ── Actual export ─────────────────────────────────────────────────────────

    async def _send_export(self):
        """Build text files and send both to Telegram admin."""
        from app.extractor.card_service import export_raw_posts_text, export_extracted_cards_text
        from app.services.telegram_service import telegram_bot_manager

        cfg = await telegram_bot_manager.get_effective_settings()
        token = cfg.get("bot_token", "")
        admin_id = cfg.get("admin_chat_id", "")

        if not token or not admin_id:
            logger.warning("Card export: Telegram token or admin_chat_id missing — skipping.")
            return

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-UTC")
        try:
            raw_text   = await export_raw_posts_text()
            cards_text = await export_extracted_cards_text()
        except Exception as exc:
            logger.error(f"Card export: failed to generate export files: {exc}", exc_info=True)
            return

        # Send intro message
        intro = (
            "📦 *Daily Card Data Export*\n\n"
            f"📅 Export time: `{now_str}`\n"
            "Two files follow:\n"
            "  1️⃣ `raw_posts.txt` — all scraped post records\n"
            "  2️⃣ `extracted_cards.txt` — extracted card data in CARD|MM|YY|CVV format"
        )
        await telegram_bot_manager.send_message(admin_id, intro)
        await asyncio.sleep(1)

        # Send files via sendDocument
        async with httpx.AsyncClient(timeout=60.0) as client:
            # File 1: raw_posts.txt
            try:
                raw_bytes = raw_text.encode("utf-8")
                files = {"document": (f"raw_posts_{now_str}.txt", raw_bytes, "text/plain")}
                data  = {"chat_id": admin_id, "caption": "📁 raw_posts.txt"}
                res   = await client.post(
                    f"https://api.telegram.org/bot{token}/sendDocument",
                    data=data,
                    files=files,
                )
                if res.status_code != 200:
                    logger.warning(f"raw_posts send failed: {res.text}")
            except Exception as exc:
                logger.error(f"raw_posts send error: {exc}", exc_info=True)

            await asyncio.sleep(1)

            # File 2: extracted_cards.txt
            try:
                card_bytes = cards_text.encode("utf-8")
                files = {"document": (f"extracted_cards_{now_str}.txt", card_bytes, "text/plain")}
                data  = {"chat_id": admin_id, "caption": "💳 extracted_cards.txt"}
                res   = await client.post(
                    f"https://api.telegram.org/bot{token}/sendDocument",
                    data=data,
                    files=files,
                )
                if res.status_code != 200:
                    logger.warning(f"extracted_cards send failed: {res.text}")
            except Exception as exc:
                logger.error(f"extracted_cards send error: {exc}", exc_info=True)

        logger.info("Card export: files sent to Telegram admin.")


# Singleton
card_export_service = CardExportService()
