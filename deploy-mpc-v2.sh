#!/bin/bash

# Deploy MPC v2 backend to Google Cloud Run

echo "=== Deploying MPC v2 Backend ==="
echo ""

# Authenticate if needed
echo "Checking authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "Please authenticate with gcloud:"
    gcloud auth login
fi

# Deploy the backend with v2 MPC
echo "Deploying backend with MPC v2 support..."
gcloud run deploy interspace-backend-dev \
  --image=gcr.io/intersend/interspace-backend:mpc-v2-amd64 \
  --region=us-central1 \
  --project=intersend \
  --platform=managed

# Test the deployment
echo ""
echo "Testing deployment..."
SERVICE_URL="https://interspace-backend-dev-784862970473.us-central1.run.app"

echo "1. Testing health endpoint..."
curl -s "$SERVICE_URL/health" | jq '.status' || echo "Health check failed"

echo ""
echo "2. Testing v2 MPC endpoints (should require auth)..."
curl -s "$SERVICE_URL/api/v2/mpc/status/test-profile" | jq || echo "MPC endpoint test failed"

echo ""
echo "=== Deployment Complete ==="
echo "Backend URL: $SERVICE_URL"
echo ""
echo "Available v2 MPC endpoints:"
echo "- POST /api/v2/mpc/backup"
echo "- POST /api/v2/mpc/export" 
echo "- GET /api/v2/mpc/status/:profileId"
echo "- POST /api/v2/mpc/rotate"
echo ""
echo "Note: All endpoints require authentication via JWT token"