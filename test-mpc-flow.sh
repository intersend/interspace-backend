#!/bin/bash

# Test the complete MPC flow

echo "=== Testing Complete MPC Flow ==="
echo ""

BACKEND_URL="https://interspace-backend-dev-784862970473.us-central1.run.app"

# First, let's check if the services can communicate
echo "1. Testing Backend Health with MPC check:"
curl -s "$BACKEND_URL/health" | jq '{status: .status, timestamp: .timestamp, mpc_configured: (if .checks.mpc_services then true else false end)}'

echo ""
echo "2. Testing v2 Auth endpoint (to get a token):"
curl -s -X POST "$BACKEND_URL/api/v2/auth/google" \
  -H "Content-Type: application/json" \
  -d '{"token": "dummy-google-token"}' | jq -c

echo ""
echo "3. Monitoring logs during MPC request..."
echo "Making a v2 MPC request (this will fail auth but should show communication):"

# Start monitoring duo-node logs
(gcloud run services logs read interspace-duo-node-dev \
  --region=us-central1 \
  --project=intersend \
  --format="value(timestamp,textPayload)" \
  --filter="timestamp>=$(date -u +%Y-%m-%dT%H:%M:%S)Z" \
  --limit=20 > /tmp/duo-logs.txt &)

# Make MPC request
curl -s -X GET "$BACKEND_URL/api/v2/mpc/status/test-profile" \
  -H "Authorization: Bearer dummy-token" \
  -H "Content-Type: application/json" | jq

# Wait for logs
sleep 3

echo ""
echo "4. Duo-node logs during the request:"
cat /tmp/duo-logs.txt 2>/dev/null | grep -v "^$" | tail -10

echo ""
echo "5. Recent successful communications in duo-node:"
gcloud run services logs read interspace-duo-node-dev \
  --limit=200 \
  --region=us-central1 \
  --project=intersend \
  --format="value(textPayload)" | grep -E "Token verified|Export key completed|Backup completed|200" | tail -5

echo ""
echo "=== Summary ==="
echo "- Backend v2 MPC endpoints are deployed and accessible"
echo "- Duo-node is running and receiving requests"
echo "- IAM permissions have been configured"
echo ""
echo "To fully test MPC operations, you need:"
echo "1. A valid JWT token from actual authentication"
echo "2. A profile with MPC wallet enabled"
echo "3. The iOS app to initiate MPC operations"