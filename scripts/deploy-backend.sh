#!/bin/bash

# Deploy backend to Google Cloud Run

set -e

# Configuration
PROJECT_ID="intersend"
REGION="us-central1"
SERVICE_NAME="interspace-backend-dev"
IMAGE_NAME="gcr.io/${PROJECT_ID}/interspace-backend"

# Get git commit SHA
COMMIT_SHA=$(git rev-parse --short HEAD || echo "latest")
echo "🔧 Deploying backend with commit SHA: ${COMMIT_SHA}"

# Build the Docker image locally first to catch errors early
echo "🔨 Building Docker image locally..."
docker build -t ${IMAGE_NAME}:${COMMIT_SHA} -t ${IMAGE_NAME}:latest .

# Push to Google Container Registry
echo "📤 Pushing image to GCR..."
docker push ${IMAGE_NAME}:${COMMIT_SHA}
docker push ${IMAGE_NAME}:latest

# Update migration job with new image
echo "🔄 Updating database migration job..."
gcloud run jobs update interspace-db-migrate-dev \
  --image=${IMAGE_NAME}:${COMMIT_SHA} \
  --region=${REGION}

# Run database migrations
echo "🗄️  Running database migrations..."
gcloud run jobs execute interspace-db-migrate-dev \
  --region=${REGION} \
  --wait

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image=${IMAGE_NAME}:${COMMIT_SHA} \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="DUO_NODE_URL=https://interspace-duo-node-dev-e67lrclhcq-uc.a.run.app" \
  --service-account="interspace-backend-dev@${PROJECT_ID}.iam.gserviceaccount.com" \
  --max-instances=10 \
  --min-instances=1 \
  --concurrency=100 \
  --cpu=1 \
  --memory=512Mi

echo "✅ Backend deployment complete!"
echo "🌐 Service URL: https://${SERVICE_NAME}-784862970473.us-central1.run.app"