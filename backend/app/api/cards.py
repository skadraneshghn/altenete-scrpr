"""
Card Extraction & Export API.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/cards", tags=["Cards"])


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
