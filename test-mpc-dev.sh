#!/bin/bash

# Test MPC operations on development environment

BASE_URL="https://interspace-backend-dev-784862970473.us-central1.run.app"
PROFILE_ID="test-profile-123"

echo "=== Testing MPC Operations on Development Environment ==="
echo "Base URL: $BASE_URL"
echo ""

# 1. Test Health Check
echo "1. Testing Health Check..."
curl -s "$BASE_URL/health" | jq '.checks.mpc_services'
echo ""

# 2. Test MPC Status (should fail without auth)
echo "2. Testing MPC Status (without auth - should fail)..."
curl -s -X GET \
  "$BASE_URL/api/v1/mpc/status" \
  -H "Content-Type: application/json" | jq
echo ""

# 3. Test duo-node health
echo "3. Testing Duo Node Health..."
DUO_NODE_URL="https://interspace-duo-node-dev-e67lrclhcq-uc.a.run.app"
echo "Duo Node URL: $DUO_NODE_URL"
# Note: This will fail without proper authentication
curl -s "$DUO_NODE_URL/health" | head -20
echo ""

# 4. Test Silence Labs Server Status
echo "4. Testing Silence Labs Server..."
SILENCE_URL="https://silence-labs-duo-server-dev-e67lrclhcq-uc.a.run.app"
echo "Silence Labs URL: $SILENCE_URL"
# This requires authentication
echo "Note: Direct access requires authentication"
echo ""

# 5. Check backend logs for MPC initialization
echo "5. Checking Backend Logs for MPC initialization..."
gcloud run services logs read interspace-backend-dev \
  --limit=20 \
  --region=us-central1 \
  --project=intersend \
  --format="value(textPayload)" | grep -i "mpc\|duo\|silence" | head -10
echo ""

echo "=== Summary ==="
echo "- Backend is deployed at: $BASE_URL"
echo "- Duo Node is deployed at: $DUO_NODE_URL"
echo "- Silence Labs Server is deployed at: $SILENCE_URL"
echo "- MPC endpoints require authentication"
echo ""
echo "To test authenticated endpoints, you need:"
echo "1. Create a user account via Google OAuth"
echo "2. Get the JWT token"
echo "3. Use the token in Authorization header"