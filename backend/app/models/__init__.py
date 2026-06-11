"""
Models package - import all models so SQLAlchemy can discover them.
"""

from app.models.user import User
from app.models.job import Job, JobLog, JobType, JobStatus, LogLevel
from app.models.forum import ForumConfig, Thread, Post

__all__ = [
    "User",
    "Job", "JobLog", "JobType", "JobStatus", "LogLevel",
    "ForumConfig", "Thread", "Post",
]
