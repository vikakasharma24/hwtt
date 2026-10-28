#!/usr/bin/env bash
# ==============================================================================
# Deploy HWTT Backend to Google Cloud Run (Enterprise 1M+ Scale)
# ==============================================================================
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${2:-asia-south1}" # Mumbai (lowest latency to Jharkhand)

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Google Cloud Project ID is required."
  echo "Usage: ./deploy_cloud_run.sh <PROJECT_ID> [REGION]"
  exit 1
fi

echo "================================================================="
echo " DEPLOYING HWTT BACKEND TO GOOGLE CLOUD RUN"
echo " Project  : $PROJECT_ID"
echo " Region   : $REGION"
echo " Sizing   : 2 GB RAM | 2 vCPU"
echo " Scale    : Min 2 instances | Max 4 instances"
echo " Concurrent Capacity: 80 requests/instance (320 concurrent requests)"
echo "================================================================="

# 1. Enable required Google Cloud APIs
echo ">> [1/4] Enabling Cloud Run & Container Registry APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project="$PROJECT_ID"

# 2. Build Container Image via Google Cloud Build
IMAGE_TAG="gcr.io/$PROJECT_ID/hwtt-backend:latest"
echo ">> [2/4] Building production container image ($IMAGE_TAG)..."
gcloud builds submit --tag "$IMAGE_TAG" --project="$PROJECT_ID"

# 3. Deploy to Cloud Run with Autoscaling and Resource Allocation
echo ">> [3/4] Deploying service to Cloud Run..."
gcloud run deploy hwtt-backend \
  --image "$IMAGE_TAG" \
  --platform managed \
  --region "$REGION" \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 2 \
  --max-instances 4 \
  --concurrency 80 \
  --timeout 300 \
  --no-cpu-throttling \
  --cpu-boost \
  --set-env-vars "PORT=8080,WEB_CONCURRENCY=4,GUNICORN_THREADS=4" \
  --allow-unauthenticated \
  --project="$PROJECT_ID"

# 4. Verification & URL Extraction
SERVICE_URL=$(gcloud run services describe hwtt-backend --platform managed --region "$REGION" --format 'value(status.url)' --project="$PROJECT_ID")
echo "================================================================="
echo " SUCCESS! HWTT Enterprise Backend is live on Google Cloud Run:"
echo " URL: $SERVICE_URL"
echo " Health Status: $SERVICE_URL/api/health"
echo "================================================================="
