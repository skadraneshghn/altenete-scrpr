"""
DuplicatePolice — the authority that decides whether an operation
should ALLOW or SKIP its work based on duplicate detection.

Usage
-----
    police = DuplicatePolice(db)

    # Thread check
    verdict = await police.check_thread("thread_xf_id_123")
    if verdict == PoliceVerdict.SKIP:
        continue   # already in DB

    # Post check
    verdict = await police.check_post(thread_id=42)
    if verdict == PoliceVerdict.SKIP:
        continue   # post already stored

The Police never raises — it always returns a PoliceVerdict.
Logging is done via an optional async log_callback.
"""

from __future__ import annotations

import logging
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.forum import Thread, Post

logger = logging.getLogger(__name__)


class PoliceVerdict(str, Enum):
    """Decision returned by DuplicatePolice."""
    ALLOW = "allow"   # item is new — proceed with operation
    SKIP  = "skip"    # item already exists — skip this step


class DuplicatePolice:
    """
    The Duplicate Police.

    Checks the database for existing Threads and Posts before an
    Operation is allowed to run.  Returning SKIP causes the calling
    Operation to move on to the next item without doing any work.

    Parameters
    ----------
    db:
        An open AsyncSession.  The Police issues read-only SELECT
        queries; it never writes.
    log_callback:
        Optional ``async def log(msg, level)`` coroutine used to emit
        structured log messages back to the job log system.
    """

    def __init__(
        self,
        db: AsyncSession,
        log_callback=None,
    ):
        self._db = db
        self._log_callback = log_callback

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _log(self, msg: str, level: str = "info") -> None:
        logger.debug("Police: %s", msg)
        if self._log_callback:
            try:
                await self._log_callback(msg, level)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def check_thread(self, thread_xf_id: str) -> PoliceVerdict:
        """
        Check whether a Thread with the given XenForo ID exists in the DB.

        Returns
        -------
        PoliceVerdict.SKIP   — thread already stored → operation must skip
        PoliceVerdict.ALLOW  — thread is new → operation may proceed
        """
        try:
            result = await self._db.execute(
                select(Thread.id).where(Thread.thread_xf_id == thread_xf_id).limit(1)
            )
            exists = result.scalar_one_or_none() is not None
        except Exception as exc:
            logger.error("Police DB error (check_thread %s): %s", thread_xf_id, exc)
            # Fail-open: allow the operation so data is not silently lost
            return PoliceVerdict.ALLOW

        if exists:
            await self._log(
                f"Police: Thread '{thread_xf_id}' already in DB → SKIP",
                "debug",
            )
            return PoliceVerdict.SKIP

        return PoliceVerdict.ALLOW

    async def check_post(self, thread_id: int) -> PoliceVerdict:
        """
        Check whether a Post linked to *thread_id* already exists in the DB.

        Returns
        -------
        PoliceVerdict.SKIP   — post already stored → operation must skip
        PoliceVerdict.ALLOW  — post is new → operation may proceed
        """
        try:
            result = await self._db.execute(
                select(Post.id).where(Post.thread_id == thread_id).limit(1)
            )
            exists = result.scalar_one_or_none() is not None
        except Exception as exc:
            logger.error("Police DB error (check_post thread_id=%s): %s", thread_id, exc)
            return PoliceVerdict.ALLOW

        if exists:
            await self._log(
                f"Police: Post for thread_id={thread_id} already in DB → SKIP",
                "debug",
            )
            return PoliceVerdict.SKIP

        return PoliceVerdict.ALLOW

    async def check_thread_by_url(self, url: str) -> PoliceVerdict:
        """
        Convenience: check by full URL instead of XF-ID.
        Useful when the XF-ID has not been parsed yet.

        Returns
        -------
        PoliceVerdict
        """
        try:
            result = await self._db.execute(
                select(Thread.id).where(Thread.url == url).limit(1)
            )
            exists = result.scalar_one_or_none() is not None
        except Exception as exc:
            logger.error("Police DB error (check_thread_by_url %s): %s", url, exc)
            return PoliceVerdict.ALLOW

        if exists:
            await self._log(
                f"Police: Thread URL '{url}' already in DB → SKIP",
                "debug",
            )
            return PoliceVerdict.SKIP

        return PoliceVerdict.ALLOW
