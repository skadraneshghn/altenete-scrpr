"""
TelegramSettings model — stores persistent configuration for the Telegram Bot engine.
"""

from datetime import datetime
from sqlalchemy import String, Boolean, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TelegramSettings(Base):
    """Configuration for the Telegram notification bot and templates."""

    __tablename__ = "telegram_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)

    # Enable/disable entire Telegram notification system
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Token and chat ID overrides if set in UI (otherwise falls back to env variables)
    bot_token_override: Mapped[str | None] = mapped_column(String(255), nullable=True)
    admin_chat_id_override: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Watch active state: whether notifications are currently being dispatched to the admin
    watch_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Message Template for new threads/posts
    # Supports placeholders: {title}, {author}, {url}, {content}, {scraped_at}
    message_template: Mapped[str] = mapped_column(
        Text,
        default=(
            "** [New Thread Discovered] **\n\n"
            "Title: {title}\n"
            "Author: {author}\n"
            "Link: {url}\n\n"
            "First Post Preview:\n{content}"
        ),
        nullable=False,
    )

    # Read-only state fields updated by the background bot runner
    bot_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bot_status: Mapped[str | None] = mapped_column(String(255), default="Stopped", nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"}
    )

