<#
.SYNOPSIS
    Deploy HWTT Backend to Google Cloud Run (Windows PowerShell)
.DESCRIPTION
    Builds and deploys the container with 2GB RAM, 2 vCPUs, and 2-4 instances autoscaler.
#>
param (
    [string]$ProjectId = $(gcloud config get-value project 2>$null),
    [string]$Region = "asia-south1"
)

if (-not $ProjectId) {
    Write-Error "Google Cloud Project ID is required. Run 'gcloud config set project <ID>' or pass -ProjectId '<ID>'"
    exit 1
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " DEPLOYING HWTT BACKEND TO GOOGLE CLOUD RUN" -ForegroundColor Cyan
Write-Host " Project  : $ProjectId"
Write-Host " Region   : $Region"
Write-Host " Sizing   : 2 GB RAM | 2 vCPU"
Write-Host " Scale    : Min 2 instances | Max 4 instances"
Write-Host " Capacity : 80 requests/instance (320 concurrent requests)"
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Enable APIs
Write-Host ">> [1/4] Enabling Cloud Run & Cloud Build APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com --project=$ProjectId

# 2. Build Container Image
$ImageTag = "gcr.io/$ProjectId/hwtt-backend:latest"
Write-Host ">> [2/4] Building container image ($ImageTag)..." -ForegroundColor Yellow
gcloud builds submit --tag $ImageTag --project=$ProjectId

# 3. Deploy Service
Write-Host ">> [3/4] Deploying to Cloud Run with 2GB RAM & 2-4 instances..." -ForegroundColor Yellow
gcloud run deploy hwtt-backend `
  --image $ImageTag `
  --platform managed `
  --region $Region `
  --memory 2Gi `
  --cpu 2 `
  --min-instances 2 `
  --max-instances 4 `
  --concurrency 80 `
  --timeout 300 `
  --no-cpu-throttling `
  --cpu-boost `
  --set-env-vars "PORT=8080,WEB_CONCURRENCY=4,GUNICORN_THREADS=4" `
  --allow-unauthenticated `
  --project=$ProjectId

# 4. Output Service URL
$ServiceUrl = gcloud run services describe hwtt-backend --platform managed --region $Region --format "value(status.url)" --project=$ProjectId
Write-Host "=================================================================" -ForegroundColor Green
Write-Host " SUCCESS! Service live at: $ServiceUrl" -ForegroundColor Green
Write-Host " Health Check: $ServiceUrl/api/health" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
