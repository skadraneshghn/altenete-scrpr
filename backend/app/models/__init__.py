"""
Models package - import all models so SQLAlchemy can discover them.
"""

from app.models.user import User
from app.models.job import Job, JobLog, JobType, JobStatus, LogLevel
from app.models.forum import ForumConfig, Thread, Post
from app.models.repeating_job import RepeatingJob
from app.models.telegram_settings import TelegramSettings
from app.models.card_export_settings import CardExportSettings

__all__ = [
    "User",
    "Job", "JobLog", "JobType", "JobStatus", "LogLevel",
    "ForumConfig", "Thread", "Post",
    "RepeatingJob",
    "TelegramSettings",
    "CardExportSettings",
]
