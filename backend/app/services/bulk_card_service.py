"""
Bulk card validation runner.

Processes a list of cards with max 5 concurrent workers.
Broadcasts real-time progress updates over WebSocket to all connected listeners
for a given job_id.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select, update

from app.database import AsyncSessionLocal
from app.models.job import Job, JobStatus, JobType, LogLevel
from app.models.card_validation import CardValidationResult

logger = logging.getLogger(__name__)

# ── External checker API ──────────────────────────────────────────────────────
_XVPN_API_URL = (
    "https://app-8019ea8b-dd0e-4d7b-9db5-60b717d474ab.cleverapps.io"
    "/api/v1/xvpn?timeout_ms=45000"
)

CONCURRENCY_LIMIT = 5  # max parallel card checks


# ── WebSocket connection registry ─────────────────────────────────────────────
# Maps job_id → set of asyncio.Queue objects (one per connected WS client)
_ws_listeners: dict[int, set[asyncio.Queue]] = {}


def register_ws(job_id: int) -> asyncio.Queue:
    """Register a new WebSocket listener for job_id. Returns the queue."""
    q: asyncio.Queue = asyncio.Queue()
    _ws_listeners.setdefault(job_id, set()).add(q)
    return q


def unregister_ws(job_id: int, q: asyncio.Queue):
    """Remove a WebSocket listener."""
    listeners = _ws_listeners.get(job_id, set())
    listeners.discard(q)
    if not listeners:
        _ws_listeners.pop(job_id, None)


async def _broadcast(job_id: int, event: dict):
    """Push an event to all WebSocket listeners for this job."""
    payload = json.dumps(event)
    for q in list(_ws_listeners.get(job_id, set())):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


# ── Core runner ───────────────────────────────────────────────────────────────

async def run_bulk_validation(job_id: int):
    """
    Entry point called by the scheduler handler.

    Loads all CardValidationResult rows for this job and processes them
    with a concurrency semaphore of CONCURRENCY_LIMIT.
    """
    logger.info("bulk_validation: starting job %d", job_id)

    try:
        # Mark parent job RUNNING
        await _set_job_status(job_id, JobStatus.RUNNING)

        # Load all result rows for this job (they were inserted when job was created)
        async with AsyncSessionLocal() as db:
            rows = (
                await db.execute(
                    select(CardValidationResult)
                    .where(CardValidationResult.job_id == job_id)
                    .order_by(CardValidationResult.id)
                )
            ).scalars().all()

        total = len(rows)
        if total == 0:
            await _set_job_status(job_id, JobStatus.COMPLETED)
            return

        # Broadcast initial state
        await _broadcast(job_id, {"type": "job_start", "job_id": job_id, "total": total})

        semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
        processed = 0
        failed = 0

        tasks = [
            asyncio.create_task(_process_one(job_id, row.id, row.card_raw, row.email, semaphore))
            for row in rows
        ]

        for coro in asyncio.as_completed(tasks):
            success = await coro
            processed += 1
            if not success:
                failed += 1

            # Update job progress in DB
            await _update_job_progress(job_id, processed, total, failed)

            # Broadcast progress
            await _broadcast(job_id, {
                "type": "progress",
                "processed": processed,
                "total": total,
                "failed": failed,
            })

        # Mark job COMPLETED or FAILED
        final_status = JobStatus.COMPLETED if failed == 0 else JobStatus.COMPLETED
        await _set_job_status(job_id, final_status)
        await _broadcast(job_id, {
            "type": "job_done",
            "job_id": job_id,
            "processed": processed,
            "failed": failed,
        })
        logger.info("bulk_validation: job %d done — %d/%d ok", job_id, processed - failed, total)

    except asyncio.CancelledError:
        logger.info("bulk_validation: job %d cancelled", job_id)
        await _set_job_status(job_id, JobStatus.CANCELLED)
        await _broadcast(job_id, {"type": "job_cancelled", "job_id": job_id})
        raise
    except Exception as exc:
        logger.error("bulk_validation: job %d crashed: %s", job_id, exc, exc_info=True)
        await _set_job_status(job_id, JobStatus.FAILED, str(exc))
        await _broadcast(job_id, {"type": "job_error", "job_id": job_id, "error": str(exc)})


async def _process_one(
    job_id: int,
    result_id: int,
    card_raw: str,
    email: str,
    semaphore: asyncio.Semaphore,
) -> bool:
    """Validate one card, persist the result, broadcast update. Returns True on success."""
    async with semaphore:
        # Mark as running
        await _set_result_status(result_id, "running")
        await _broadcast(job_id, {
            "type": "card_start",
            "result_id": result_id,
            "card_raw": card_raw,
            "email": email,
        })

        # Parse card
        parts = [p.strip() for p in card_raw.split("|")]
        if len(parts) != 4:
            await _finish_result(result_id, "failed", error="Invalid card format (expected CARD|MM|YY|CVC)")
            await _broadcast(job_id, {
                "type": "card_done",
                "result_id": result_id,
                "card_raw": card_raw,
                "email": email,
                "status": "failed",
                "error": "Invalid card format",
                "all_steps_ok": False,
                "steps_passed": 0,
                "steps_total": 0,
                "elapsed_ms": 0,
            })
            return False

        card_number, exp_month, exp_year, cvc = parts
        card_expiry = f"{exp_month} / {exp_year}"

        payload: dict[str, Any] = {
            "email": email,
            "cardnumber": card_number,
            "cardExpiry": card_expiry,
            "cvc": cvc,
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    _XVPN_API_URL,
                    json=payload,
                    headers={
                        "accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
                resp.raise_for_status()
                data: dict = resp.json()

            steps: list[dict] = data.get("steps", [])
            steps_passed = sum(1 for s in steps if s.get("ok"))
            steps_total = len(steps)
            all_ok = steps_passed == steps_total and steps_total > 0
            elapsed_ms = data.get("elapsed_ms")

            # Strip massive screenshot to keep DB lean (truncate to tiny marker)
            slim_data = {k: v for k, v in data.items() if k != "screenshot_base64"}
            slim_data["screenshot_base64"] = "(omitted)" if data.get("screenshot_base64") else None

            await _finish_result(
                result_id,
                "completed",
                all_steps_ok=all_ok,
                steps_passed=steps_passed,
                steps_total=steps_total,
                elapsed_ms=elapsed_ms,
                result_json=json.dumps(slim_data),
            )

            # Extract the last captured API call response_body for display
            api_calls: list[dict] = data.get("api_calls", [])
            api_response_body = None
            if api_calls:
                last_call = api_calls[-1]
                api_response_body = last_call.get("response_body")

            event: dict = {
                "type": "card_done",
                "result_id": result_id,
                "card_raw": card_raw,
                "card_number": card_number,
                "email": email,
                "status": "completed",
                "all_steps_ok": all_ok,
                "steps_passed": steps_passed,
                "steps_total": steps_total,
                "elapsed_ms": elapsed_ms,
                "steps": steps,
                "api_response_body": api_response_body,
            }
            await _broadcast(job_id, event)
            return all_ok

        except httpx.HTTPStatusError as exc:
            err = f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"
            await _finish_result(result_id, "failed", error=err)
            await _broadcast(job_id, {
                "type": "card_done",
                "result_id": result_id,
                "card_raw": card_raw,
                "email": email,
                "status": "failed",
                "error": err,
                "all_steps_ok": False,
                "steps_passed": 0,
                "steps_total": 0,
                "elapsed_ms": None,
            })
            return False
        except Exception as exc:
            err = str(exc)
            await _finish_result(result_id, "failed", error=err)
            await _broadcast(job_id, {
                "type": "card_done",
                "result_id": result_id,
                "card_raw": card_raw,
                "email": email,
                "status": "failed",
                "error": err,
                "all_steps_ok": False,
                "steps_passed": 0,
                "steps_total": 0,
                "elapsed_ms": None,
            })
            return False


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _set_job_status(job_id: int, status: JobStatus, error: str | None = None):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return
        job.status = status
        if error:
            job.error_message = error[:500]
        if status == JobStatus.RUNNING and not job.started_at:
            job.started_at = datetime.now(timezone.utc)
        if status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
            job.completed_at = datetime.now(timezone.utc)
        await db.commit()


async def _update_job_progress(job_id: int, processed: int, total: int, failed: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Job).where(Job.id == job_id))
        job = result.scalar_one_or_none()
        if not job:
            return
        job.processed_items = processed
        job.total_items = total
        job.failed_items = failed
        await db.commit()


async def _set_result_status(result_id: int, status: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CardValidationResult).where(CardValidationResult.id == result_id)
        )
        row = result.scalar_one_or_none()
        if row:
            row.status = status
            await db.commit()


async def _finish_result(
    result_id: int,
    status: str,
    all_steps_ok: bool | None = None,
    steps_passed: int | None = None,
    steps_total: int | None = None,
    elapsed_ms: int | None = None,
    error: str | None = None,
    result_json: str | None = None,
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CardValidationResult).where(CardValidationResult.id == result_id)
        )
        row = result.scalar_one_or_none()
        if not row:
            return
        row.status = status
        row.all_steps_ok = all_steps_ok
        row.steps_passed = steps_passed
        row.steps_total = steps_total
        row.elapsed_ms = elapsed_ms
        row.error_message = error
        row.result_json = result_json
        row.completed_at = datetime.now(timezone.utc)
        await db.commit()
