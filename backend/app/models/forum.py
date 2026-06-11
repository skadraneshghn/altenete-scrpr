"""
Forum-related models: ForumConfig, Thread, Post.
"""

from datetime import datetime
from sqlalchemy import (
    String, Integer, DateTime, Text, ForeignKey, func, Index
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ForumConfig(Base):
    """Configuration for a forum to scrape."""

    __tablename__ = "forum_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    forum_url: Mapped[str] = mapped_column(String(500), nullable=False)
    forum_section_url: Mapped[str] = mapped_column(String(500), nullable=False)
    xf_username: Mapped[str] = mapped_column(String(255), nullable=False)
    xf_password_encrypted: Mapped[str] = mapped_column(String(500), nullable=False)
    max_pages: Mapped[int] = mapped_column(Integer, default=0)  # 0 = all pages
    scrape_delay: Mapped[float] = mapped_column(default=2.0)
    is_active: Mapped[bool] = mapped_column(default=True)
    session_cookies: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    threads: Mapped[list["Thread"]] = relationship(back_populates="forum_config", cascade="all, delete-orphan")


class Thread(Base):
    """A forum thread discovered by the crawler."""

    __tablename__ = "threads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    thread_xf_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    author: Mapped[str] = mapped_column(String(255), nullable=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    replies: Mapped[int] = mapped_column(Integer, default=0)
    views: Mapped[int] = mapped_column(Integer, default=0)
    is_sticky: Mapped[bool] = mapped_column(default=False)
    thread_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    config_id: Mapped[int | None] = mapped_column(
        ForeignKey("forum_configs.id", ondelete="SET NULL"), nullable=True
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    forum_config: Mapped["ForumConfig | None"] = relationship(back_populates="threads")
    post: Mapped["Post | None"] = relationship(back_populates="thread", uselist=False, cascade="all, delete-orphan")
    job: Mapped["Job | None"] = relationship(back_populates="threads")

    __table_args__ = (
        Index("ix_threads_scraped_at", "scraped_at"),
        Index("ix_threads_author", "author"),
    )


class Post(Base):
    """The first post content from a thread."""

    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    content_html: Mapped[str | None] = mapped_column(
        Text().with_variant(LONGTEXT, "mysql"), nullable=True
    )
    content_text: Mapped[str | None] = mapped_column(
        Text().with_variant(LONGTEXT, "mysql"), nullable=True
    )
    author: Mapped[str | None] = mapped_column(String(255), nullable=True)
    post_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # Relationships
    thread: Mapped["Thread"] = relationship(back_populates="post")


# Import Job here to avoid circular imports at class level
from app.models.job import Job  # noqa: E402
