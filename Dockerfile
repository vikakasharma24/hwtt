# ==============================================================================
# Production Dockerfile (Enterprise High-Scale Container)
# ==============================================================================
FROM python:3.11-slim as base

# Python environment settings for production
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    WEB_CONCURRENCY=4 \
    GUNICORN_THREADS=4

WORKDIR /app

# Install minimal system dependencies & security updates
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root application user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application source code with permissions
COPY --chown=appuser:appuser . .

# Run as non-privileged user for container security
USER appuser

# Expose HTTP port (Cloud Run defaults to 8080, Render maps dynamic $PORT)
EXPOSE 8080 5000

# Container health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8080}/api/health || exit 1

# Launch production WSGI server
CMD ["sh", "-c", "gunicorn -c gunicorn.conf.py app:app"]
