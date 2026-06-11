"""
Application configuration using pydantic-settings.
All values are loaded from environment variables or .env file.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings."""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./altenete_scrpr.db"

    # JWT Authentication
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # XenForo Forum Configuration
    XF_BASE_URL: str = "https://altenens.is"
    XF_FORUM_URL: str = "https://altenens.is/forums/accounts-and-database-dumps.45/"
    XF_USERNAME: str = ""
    XF_PASSWORD: str = ""

    # Scraper Settings
    SCRAPE_DELAY: float = 2.0
    MAX_CONCURRENT_SCRAPES: int = 3
    MAX_RETRIES: int = 3

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
