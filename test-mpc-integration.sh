#!/bin/bash

# Test MPC integration between backend, duo-node, and Silence Labs server

echo "=== Testing MPC Integration on Google Cloud ==="
echo ""

BACKEND_URL="https://interspace-backend-dev-784862970473.us-central1.run.app"
DUO_NODE_URL="https://interspace-duo-node-dev-e67lrclhcq-uc.a.run.app"

echo "1. Checking service health..."
echo "- Backend health:"
curl -s "$BACKEND_URL/health" | jq -c '{status: .status, mpc: .checks.mpc_services}'

echo ""
echo "2. Testing v2 MPC endpoints (should return auth error):"
echo "- GET /api/v2/mpc/status/:profileId"
curl -s "$BACKEND_URL/api/v2/mpc/status/test-profile" | jq -c

echo ""
echo "3. Checking duo-node accessibility from backend service account:"
# Get the service account that backend uses
SA=$(gcloud run services describe interspace-backend-dev \
  --region=us-central1 \
  --project=intersend \
  --format="value(spec.template.spec.serviceAccountName)")
echo "Backend service account: $SA"

echo ""
echo "4. Checking if backend has correct duo-node configuration:"
gcloud run services describe interspace-backend-dev \
  --region=us-central1 \
  --project=intersend \
  --format="json" | jq -r '.spec.template.spec.containers[0].env[] | select(.name | contains("DUO")) | "\(.name)=\(.value)"'

echo ""
echo "5. Testing internal connectivity (via Cloud Shell with service account impersonation):"
echo "Note: This requires proper IAM permissions"

# Check recent logs for any MPC-related errors
echo ""
echo "6. Recent backend logs related to MPC:"
gcloud run services logs read interspace-backend-dev \
  --limit=100 \
  --region=us-central1 \
  --project=intersend \
  --format="value(textPayload)" | grep -i "mpc\|duo\|silence" | tail -10

echo ""
echo "7. Recent duo-node logs:"
gcloud run services logs read interspace-duo-node-dev \
  --limit=20 \
  --region=us-central1 \
  --project=intersend \
  --format="value(textPayload)" | tail -10

echo ""
echo "=== Summary ==="
echo "Backend URL: $BACKEND_URL"
echo "Duo Node URL: $DUO_NODE_URL"
echo "Architecture: Backend → Duo Node → Silence Labs Server"
echo ""
echo "To test with authentication:"
echo "1. Create a user account through the app"
echo "2. Get the JWT token from the login response"
echo "3. Use: Authorization: Bearer <token>"