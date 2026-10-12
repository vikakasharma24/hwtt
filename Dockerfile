# Multi-stage / lightweight production Python image
FROM python:3.11-slim

# Avoid buffering stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=5000

WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Expose server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Launch application via Gunicorn WSGI
CMD ["sh", "-c", "gunicorn --workers 4 --threads 2 --bind 0.0.0.0:${PORT:-5000} app:app"]
