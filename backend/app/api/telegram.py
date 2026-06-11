"""
Telegram Bot configuration API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.telegram_service import telegram_bot_manager

router = APIRouter(prefix="/api/telegram", tags=["Telegram"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TelegramSettingsResponse(BaseModel):
    enabled: bool
    watch_enabled: bool
    bot_token_override: str | None = None
    admin_chat_id_override: str | None = None
    message_template: str
    
    # Read-only bot state
    bot_username: str | None = None
    bot_status: str | None = None
    last_error: str | None = None
    
    # Info helpers
    has_token_in_env: bool
    has_admin_id_in_env: bool


class TelegramSettingsUpdate(BaseModel):
    enabled: bool
    watch_enabled: bool
    bot_token_override: str | None = Field(default=None, max_length=255)
    admin_chat_id_override: str | None = Field(default=None, max_length=255)
    message_template: str = Field(..., max_length=2000)


class TelegramTestRequest(BaseModel):
    message: str = Field(default="⚡ Test message from Altenete Scraper Admin Dashboard!")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=TelegramSettingsResponse)
async def get_telegram_settings(
    _: User = Depends(get_current_user),
):
    """Retrieve full settings and status info for the Telegram bot manager."""
    from app.config import get_settings
    env_settings = get_settings()
    
    cfg = await telegram_bot_manager.get_effective_settings()
    
    return TelegramSettingsResponse(
        enabled=cfg["enabled"],
        watch_enabled=cfg["watch_enabled"],
        bot_token_override=cfg["bot_token"] if cfg["bot_token"] != env_settings.TELEGRAM_BOT_TOKEN else "",
        admin_chat_id_override=cfg["admin_chat_id"] if cfg["admin_chat_id"] != env_settings.TELEGRAM_ADMIN_CHAT_ID else "",
        message_template=cfg["message_template"],
        bot_username=cfg["bot_username"],
        bot_status=cfg["bot_status"],
        last_error=cfg["last_error"],
        has_token_in_env=bool(env_settings.TELEGRAM_BOT_TOKEN),
        has_admin_id_in_env=bool(env_settings.TELEGRAM_ADMIN_CHAT_ID),
    )


@router.put("/settings", response_model=TelegramSettingsResponse)
async def update_telegram_settings(
    body: TelegramSettingsUpdate,
    _: User = Depends(get_current_user),
):
    """Update settings for the Telegram bot (changes apply instantly)."""
    # Clean overrides if empty strings passed
    data = body.model_dump()
    if not data.get("bot_token_override"):
        data["bot_token_override"] = None
    if not data.get("admin_chat_id_override"):
        data["admin_chat_id_override"] = None

    await telegram_bot_manager.update_settings(data)
    return await get_telegram_settings()


@router.post("/test")
async def send_test_notification(
    body: TelegramTestRequest,
    _: User = Depends(get_current_user),
):
    """Dispatch a test message to verify the Telegram bot credentials are valid."""
    cfg = await telegram_bot_manager.get_effective_settings()
    admin_id = cfg["admin_chat_id"]
    
    if not admin_id:
        raise HTTPException(
            status_code=400,
            detail="Admin Chat ID is not configured. Please start the bot or specify an ID first."
        )

    success = await telegram_bot_manager.send_message(admin_id, body.message)
    if not success:
        raise HTTPException(
            status_code=502,
            detail="Failed to send Telegram message. Please check the logs/status."
        )
        
    return {"status": "success", "message": "Test notification sent successfully"}
