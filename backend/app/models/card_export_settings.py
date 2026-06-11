"""
CardExportSettings model — stored in the MAIN MySQL DB, controls whether
daily Telegram export of card data is enabled.
"""

from datetime import datetime
from sqlalchemy import Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CardExportSettings(Base):
    """Settings controlling the daily card data Telegram export."""

    __tablename__ = "card_export_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)

    # Master switch: whether the card extraction subsystem is active at all
    extractor_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Whether daily export to Telegram is active
    daily_export_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )
