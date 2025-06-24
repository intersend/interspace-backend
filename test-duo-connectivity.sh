#!/bin/bash

# Test connectivity between backend and duo-node within Google Cloud

echo "=== Testing Duo Node Connectivity within Google Cloud ==="
echo ""

# Backend service account for authentication
SERVICE_ACCOUNT="interspace-backend-dev@intersend.iam.gserviceaccount.com"
DUO_NODE_URL="https://interspace-duo-node-dev-e67lrclhcq-uc.a.run.app"
DUO_NODE_AUDIENCE="https://interspace-duo-node-dev-784862970473-uc.a.run.app"

echo "1. Getting Google Cloud identity token for backend service account..."
echo "Service Account: $SERVICE_ACCOUNT"
echo "Audience: $DUO_NODE_AUDIENCE"

# This needs to be run from a service with the backend service account
echo ""
echo "2. Testing direct duo-node endpoints:"

# Test health endpoint
echo "- Health endpoint (requires auth):"
curl -s -X GET "$DUO_NODE_URL/health" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=$DUO_NODE_AUDIENCE --impersonate-service-account=$SERVICE_ACCOUNT 2>/dev/null || echo 'TOKEN_FAILED')" \
  | head -20

echo ""
echo "3. Testing Silence Labs server connectivity through duo-node:"
echo "- Status endpoint through proxy:"
curl -s -X GET "$DUO_NODE_URL/v3/status" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=$DUO_NODE_AUDIENCE --impersonate-service-account=$SERVICE_ACCOUNT 2>/dev/null || echo 'TOKEN_FAILED')" \
  -H "Content-Type: application/json"

echo ""
echo "4. Testing backend MPC endpoints:"
BACKEND_URL="https://interspace-backend-dev-784862970473.us-central1.run.app"

# First, we need a valid JWT token from the backend
echo "- Testing MPC status endpoint (v1):"
curl -s -X GET "$BACKEND_URL/api/v1/mpc/status" \
  -H "Content-Type: application/json"

echo ""
echo "=== Summary ==="
echo "- Duo Node URL: $DUO_NODE_URL"
echo "- Expected Audience: $DUO_NODE_AUDIENCE"
echo "- Backend should use service account: $SERVICE_ACCOUNT"
echo ""
echo "Note: The duo-node validates Google Cloud identity tokens from the backend service account."