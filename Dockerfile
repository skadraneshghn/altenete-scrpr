# =============================================================================
# Stage 1: Build the React/Vite frontend
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copy package files first to leverage Docker layer cache
COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps --prefer-offline

# Copy all frontend source files
COPY frontend/ ./

# Build production assets — Tailwind v4 scans src/ during this step
RUN npm run build


# =============================================================================
# Stage 2: Python backend — serves both the API and the compiled frontend
# =============================================================================
FROM python:3.11-slim-bookworm AS backend

WORKDIR /app

# Install system dependencies for aiomysql / cryptography / bcrypt
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (separate layer for caching)
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ ./

# Copy compiled frontend dist from Stage 1
# Placed at /frontend/dist — explicitly set via FRONTEND_DIST_PATH env var below
COPY --from=frontend-builder /frontend/dist /frontend/dist
RUN chmod -R 755 /frontend/dist

# -----------------------------------------------------------------------
# Environment configuration
# -----------------------------------------------------------------------
# Tell the app exactly where the built frontend lives — no path guessing
ENV FRONTEND_DIST_PATH=/frontend/dist

# Python / uvicorn settings
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Clever Cloud routes external traffic to port 8080
ENV PORT=8080

EXPOSE 8080

# -----------------------------------------------------------------------
# Health check — Clever Cloud uses this to determine readiness
# -----------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# -----------------------------------------------------------------------
# Start command
# -----------------------------------------------------------------------
# --workers 1  — single worker avoids APScheduler running twice
# --no-access-log — reduce noise, use app-level logging
CMD uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8080 \
    --workers 1 \
    --no-access-log
