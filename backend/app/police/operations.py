"""
Operation base class and concrete implementations.

Every "step" inside a Job is modelled as an Operation.  Before doing any
real work, an Operation *consults the Police* — if the verdict is SKIP the
operation records it and returns immediately, preventing any duplicate from
being written to the database.

Architecture
------------

    Job
    └── [many] Operation
            │
            ▼ consult(police)
        DuplicatePolice ──► SKIP  →  OperationResult(skipped=True)
                        ──► ALLOW →  <execute real work>
                                     OperationResult(success/failed)

Concrete operations
-------------------
- ThreadOperation  — decides whether to save a newly discovered Thread.
- PostOperation    — decides whether to scrape & save a Post for a Thread.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine

from app.police.duplicate_police import DuplicatePolice, PoliceVerdict

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------

class OperationStatus(str, Enum):
    SUCCESS = "success"
    SKIPPED = "skipped"   # Police said SKIP
    FAILED  = "failed"


@dataclass
class OperationResult:
    """The outcome of a single Operation execution."""
    status: OperationStatus
    message: str = ""
    data: Any = None  # arbitrary payload returned by the operation

    # Convenience shortcuts
    @property
    def success(self) -> bool:
        return self.status == OperationStatus.SUCCESS

    @property
    def skipped(self) -> bool:
        return self.status == OperationStatus.SKIPPED

    @property
    def failed(self) -> bool:
        return self.status == OperationStatus.FAILED

    @classmethod
    def ok(cls, message: str = "", data: Any = None) -> "OperationResult":
        return cls(OperationStatus.SUCCESS, message, data)

    @classmethod
    def skip(cls, message: str = "") -> "OperationResult":
        return cls(OperationStatus.SKIPPED, message)

    @classmethod
    def fail(cls, message: str = "") -> "OperationResult":
        return cls(OperationStatus.FAILED, message)


# ---------------------------------------------------------------------------
# Base Operation
# ---------------------------------------------------------------------------

class Operation:
    """
    Abstract base class for a single unit of work within a Job.

    Subclasses must implement:
        _police_check(police) -> PoliceVerdict   — ask the Police
        _execute(**kwargs)   -> OperationResult  — do the real work
    """

    name: str = "Operation"

    async def run(self, police: DuplicatePolice, **kwargs) -> OperationResult:
        """
        The entry point called by a Job runner.

        1. Consults the Police.
        2. If SKIP  → returns OperationResult.skip immediately.
        3. If ALLOW → delegates to _execute().
        """
        verdict = await self._police_check(police)

        if verdict == PoliceVerdict.SKIP:
            msg = f"[{self.name}] Police verdict: SKIP"
            logger.debug(msg)
            return OperationResult.skip(msg)

        logger.debug("[%s] Police verdict: ALLOW — executing", self.name)
        return await self._execute(**kwargs)

    async def _police_check(self, police: DuplicatePolice) -> PoliceVerdict:
        raise NotImplementedError

    async def _execute(self, **kwargs) -> OperationResult:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# ThreadOperation
# ---------------------------------------------------------------------------

class ThreadOperation(Operation):
    """
    Decides whether a discovered Thread should be saved to the database.

    The Police checks by ``thread_xf_id``.  If the thread already exists
    the operation is skipped — no duplicate row is inserted.

    Parameters
    ----------
    thread_xf_id:
        The XenForo thread ID (e.g. "threads.12345").
    save_fn:
        An async callable that performs the actual DB insert/update.
        Signature: ``async def save_fn() -> bool``
        Return True on success, False on failure.
    """

    name = "ThreadOperation"

    def __init__(
        self,
        thread_xf_id: str,
        save_fn: Callable[[], Coroutine[Any, Any, bool]],
    ):
        self._thread_xf_id = thread_xf_id
        self._save_fn = save_fn

    async def _police_check(self, police: DuplicatePolice) -> PoliceVerdict:
        return await police.check_thread(self._thread_xf_id)

    async def _execute(self, **_) -> OperationResult:
        try:
            ok = await self._save_fn()
            if ok:
                return OperationResult.ok(
                    f"Thread '{self._thread_xf_id}' saved successfully."
                )
            return OperationResult.fail(
                f"Thread '{self._thread_xf_id}' save function returned False."
            )
        except Exception as exc:
            msg = f"Thread '{self._thread_xf_id}' save raised: {exc}"
            logger.error(msg, exc_info=True)
            return OperationResult.fail(msg)


# ---------------------------------------------------------------------------
# PostOperation
# ---------------------------------------------------------------------------

class PostOperation(Operation):
    """
    Decides whether a Post for a given Thread should be scraped and saved.

    The Police checks by ``thread_id`` (the PK in the ``threads`` table).
    If a Post already exists for that thread the operation is skipped.

    Parameters
    ----------
    thread_id:
        The integer PK of the Thread row.
    scrape_fn:
        An async callable that scrapes and persists the Post.
        Signature: ``async def scrape_fn() -> bool``
        Return True on success, False on failure.
    thread_label:
        A human-readable label (title or XF-ID) used in log messages.
    """

    name = "PostOperation"

    def __init__(
        self,
        thread_id: int,
        scrape_fn: Callable[[], Coroutine[Any, Any, bool]],
        thread_label: str = "",
    ):
        self._thread_id = thread_id
        self._scrape_fn = scrape_fn
        self._label = thread_label or f"thread_id={thread_id}"

    async def _police_check(self, police: DuplicatePolice) -> PoliceVerdict:
        return await police.check_post(self._thread_id)

    async def _execute(self, **_) -> OperationResult:
        try:
            ok = await self._scrape_fn()
            if ok:
                return OperationResult.ok(
                    f"Post for '{self._label}' scraped and saved."
                )
            return OperationResult.fail(
                f"Post for '{self._label}' scrape function returned False."
            )
        except Exception as exc:
            msg = f"Post for '{self._label}' scrape raised: {exc}"
            logger.error(msg, exc_info=True)
            return OperationResult.fail(msg)
