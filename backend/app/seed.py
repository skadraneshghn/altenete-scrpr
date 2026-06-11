"""
Database seeding script to create initial admin user.
"""

import asyncio
import logging
from sqlalchemy import select
from app.database import AsyncSessionLocal, init_db, close_db
from app.models.user import User
from app.services.auth_service import hash_password

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed():
    """Seed the database with an admin user."""
    logger.info("Initializing database tables...")
    await init_db()

    async with AsyncSessionLocal() as db:
        # Check if salman user exists
        result = await db.execute(select(User).where(User.username == "salman"))
        existing_user = result.scalar_one_or_none()

        if existing_user:
            logger.info("Database already seeded. User 'salman' exists.")
            return

        logger.info("Seeding initial admin user 'salman'...")
        admin = User(
            username="salman",
            email="salman@example.com",
            hashed_password=hash_password("136517"),
        )
        db.add(admin)
        await db.commit()
        logger.info("Successfully seeded admin user: username=salman")


if __name__ == "__main__":
    asyncio.run(seed())
