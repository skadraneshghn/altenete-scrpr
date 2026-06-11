# --- Stage 1: Build the React frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Build the FastAPI backend and serve ---
FROM python:3.11-slim-bookworm
WORKDIR /app

# Install system dependencies needed for python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmariadb-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements first to leverage Docker cache
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY backend/ ./

# Copy compiled frontend dist assets from Stage 1 into backend's root folder structure
COPY --from=frontend-builder /frontend/dist /frontend/dist

# Expose port (Clever Cloud routes traffic to port 8080 by default)
EXPOSE 8080

# Environment variables defaults
ENV PORT=8080
ENV PYTHONPATH=.

# Start the application using uvicorn
CMD uvicorn app.main:app --host 0.0.0.0 --port 8080
