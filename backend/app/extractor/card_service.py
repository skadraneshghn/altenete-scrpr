"""
Card Extraction Service — orchestrates extraction from post content,
persistence to PostgreSQL, and exposes helpers used by the Telegram exporter.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func

from app.extractor.card_extractor import extract_cards, ExtractedCard as ParsedCard
from app.extractor.card_db import (
    RawPost, ExtractedCard, get_pg_session,
    init_card_db, close_card_db,
)

logger = logging.getLogger(__name__)


# ─────────────────────────── Core processing function ────────────────────────

async def process_post(
    *,
    thread_id: int,
    thread_xf_id: Optional[str] = None,
    thread_title: Optional[str] = None,
    thread_url: Optional[str] = None,
    author: Optional[str] = None,
    content_text: Optional[str] = None,
) -> int:
    """
    1. Upsert a RawPost row in PostgreSQL.
    2. Run the card extractor on the text content.
    3. Persist any discovered cards (deduplication: skip if card_number already in table).
    4. Return the count of *new* cards inserted.
    """
    Session = get_pg_session()
    if Session is None:
        logger.warning("Card DB not initialised — skipping process_post")
        return 0

    try:
        async with Session() as db:
            # ── Upsert raw_post ──────────────────────────────────────────────
            result = await db.execute(
                select(RawPost).where(RawPost.thread_id == thread_id)
            )
            raw = result.scalar_one_or_none()

            if raw is None:
                raw = RawPost(
                    thread_id=thread_id,
                    thread_xf_id=thread_xf_id,
                    thread_title=thread_title,
                    thread_url=thread_url,
                    author=author,
                    content_text=content_text,
                )
                db.add(raw)
                await db.flush()
            else:
                # Update content if newer
                raw.content_text = content_text
                raw.thread_title = thread_title or raw.thread_title

            raw.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)

            # ── Extract cards ────────────────────────────────────────────────
            cards: list[ParsedCard] = extract_cards(content_text or "")
            raw.cards_found = len(cards)

            new_count = 0
            for card in cards:
                # Check for duplicate by card number
                dup = await db.execute(
                    select(ExtractedCard).where(
                        ExtractedCard.card_number == card.card_number
                    )
                )
                if dup.scalar_one_or_none() is not None:
                    continue

                db.add(ExtractedCard(
                    raw_post_id=raw.id,
                    card_number=card.card_number,
                    exp_month=card.exp_month,
                    exp_year=card.exp_year,
                    cvv=card.cvv,
                    pipe_format=card.to_pipe(),
                    source_thread_id=thread_id,
                    source_url=thread_url,
                ))
                new_count += 1

            await db.commit()
            if new_count:
                logger.info(
                    f"[CardExtractor] thread_id={thread_id}: "
                    f"{new_count} new card(s) extracted and saved."
                )
            return new_count

    except Exception as exc:
        logger.error(f"[CardExtractor] process_post failed for thread_id={thread_id}: {exc}", exc_info=True)
        return 0


# ─────────────────────────── Export helpers ──────────────────────────────────

async def export_raw_posts_text() -> str:
    """
    Dump all RawPost rows as a plain-text file content.
    Format:
      [ID] Thread Title
      URL: ...
      Author: ...
      Scraped: ...
      Cards found: N
      ---
    """
    Session = get_pg_session()
    if Session is None:
        return "(Card DB not configured)"

    async with Session() as db:
        rows = (await db.execute(
            select(RawPost).order_by(RawPost.scraped_at.desc())
        )).scalars().all()

    lines = [
        f"Raw Posts Export — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"Total records: {len(rows)}",
        "=" * 70,
        "",
    ]
    for r in rows:
        lines.append(f"[ID {r.id}] {r.thread_title or '(no title)'}")
        lines.append(f"  URL:    {r.thread_url or '—'}")
        lines.append(f"  Author: {r.author or '—'}")
        lines.append(f"  Scraped:   {r.scraped_at}")
        lines.append(f"  Processed: {r.processed_at or '—'}")
        lines.append(f"  Cards found: {r.cards_found}")
        lines.append("")
    return "\n".join(lines)


async def export_extracted_cards_text() -> str:
    """
    Dump all ExtractedCard rows as plain text (one pipe-format per line),
    prefixed with a header.
    """
    Session = get_pg_session()
    if Session is None:
        return "(Card DB not configured)"

    async with Session() as db:
        rows = (await db.execute(
            select(ExtractedCard).order_by(ExtractedCard.extracted_at.desc())
        )).scalars().all()

    lines = [
        f"Extracted Cards Export — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        f"Total records: {len(rows)}",
        f"Format: CARD_NUMBER|MM|YY|CVV",
        "=" * 70,
        "",
    ]
    for r in rows:
        lines.append(r.pipe_format)
    return "\n".join(lines)


async def get_card_stats() -> dict:
    """Return quick summary stats from the card DB."""
    Session = get_pg_session()
    if Session is None:
        return {"raw_posts": 0, "extracted_cards": 0, "db_connected": False}
    try:
        async with Session() as db:
            raw_count   = (await db.execute(select(func.count(RawPost.id)))).scalar() or 0
            card_count  = (await db.execute(select(func.count(ExtractedCard.id)))).scalar() or 0
        return {"raw_posts": raw_count, "extracted_cards": card_count, "db_connected": True}
    except Exception as exc:
        logger.error(f"get_card_stats failed: {exc}")
        return {"raw_posts": 0, "extracted_cards": 0, "db_connected": False}
