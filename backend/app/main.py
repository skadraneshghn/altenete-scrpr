"""
FastAPI application entry point.
Sets up the app, middleware, routes, and lifecycle events.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db, close_db
from app.scheduler.scheduler import init_scheduler, shutdown_scheduler

# Import all models so SQLAlchemy can discover them
import app.models  # noqa: F401

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown lifecycle."""
    # Startup
    logger.info("Starting up application...")
    await init_db()
    logger.info("Database initialized")

    # Auto-seed admin user if 'salman' does not exist
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.services.auth_service import hash_password
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        user_exists = (await db.execute(select(User).where(User.username == "salman"))).scalar_one_or_none()
        if not user_exists:
            logger.info("Seeding default admin user (username: salman, password: [hidden])...")
            default_admin = User(
                username="salman",
                email="salman@example.com",
                hashed_password=hash_password("136517"),
            )
            db.add(default_admin)
            await db.commit()
            logger.info("Seeding completed.")

    init_scheduler()
    logger.info("Scheduler started")

    yield

    # Shutdown
    logger.info("Shutting down application...")
    shutdown_scheduler()
    await close_db()
    logger.info("Application shut down")


# Create FastAPI app
app = FastAPI(
    title="Altenete Forum Scraper",
    description=(
        "A XenForo forum scraper and crawler with job scheduling, "
        "built with FastAPI, Scrapling, and MySQL."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL, 
        "http://localhost:8080", 
        "http://127.0.0.1:8080", 
        "http://localhost:5173", 
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Include API routers
from app.api.auth import router as auth_router
from app.api.jobs import router as jobs_router
from app.api.forums import router as forums_router
from app.api.dashboard import router as dashboard_router

app.include_router(auth_router)
app.include_router(jobs_router)
app.include_router(forums_router)
app.include_router(dashboard_router)


@app.get("/api/health", tags=["Health"])
async def health():
    """API health check."""
    return {"status": "healthy"}


# Mount frontend static files in production mode
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/dist"))

if os.path.exists(frontend_path):
    # Mount the assets folder
    assets_path = os.path.join(frontend_path, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")

    # Serve index.html or other assets on root /
    @app.get("/{catchall:path}", include_in_schema=False)
    async def serve_spa(catchall: str):
        # Prevent intercepting API routes
        if catchall.startswith("api/") or catchall.startswith("docs") or catchall.startswith("redoc") or catchall.startswith("openapi.json"):
            return {"detail": "Not Found"}
        
        # Check if requested file exists inside dist
        file_path = os.path.join(frontend_path, catchall)
        if catchall and os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to index.html for React Router SPA
        index_file = os.path.join(frontend_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"detail": "Frontend index.html not found"}
else:
    @app.get("/", tags=["Health"])
    async def root():
        """Health check endpoint (dev fallback)."""
        return {
            "status": "ok",
            "app": "Altenete Forum Scraper (Dev Mode)",
            "version": "1.0.0",
        }
