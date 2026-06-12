"""
CardValidationResult model — stores the outcome of each card in a bulk validation job.
"""

from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CardValidationResult(Base):
    """One row per card in a bulk validation run."""

    __tablename__ = "card_validation_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Link to the parent Job (VALIDATE_CARDS job)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Card data
    card_raw: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)

    # Parsed card parts
    card_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    exp_month: Mapped[str | None] = mapped_column(String(4), nullable=True)
    exp_year: Mapped[str | None] = mapped_column(String(4), nullable=True)
    cvc: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Processing state
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    # pending | running | completed | failed

    # Result data
    all_steps_ok: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    steps_passed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    steps_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elapsed_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # full JSON response

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
