#!/bin/bash

# Complete MPC testing with authentication

BACKEND_URL="https://interspace-backend-dev-784862970473.us-central1.run.app"

echo "=== Complete MPC Testing with Authentication ==="
echo ""

# Step 1: Create a test user (using mock auth for development)
echo "1. Creating test user..."
AUTH_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/auth/google" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test-google-token-'$(date +%s)'",
    "email": "mpc-test-'$(date +%s)'@example.com",
    "name": "MPC Test User"
  }')

echo "Auth response:"
echo "$AUTH_RESPONSE" | jq -c

# Extract JWT token
JWT_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.data.accessToken // .accessToken // .token // empty')

if [ -z "$JWT_TOKEN" ]; then
  echo "Failed to get JWT token. Trying bypass login..."
  
  # Try bypass login if enabled
  AUTH_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/auth/bypass-login" \
    -H "Content-Type: application/json" \
    -d '{"email": "mpc-test@example.com"}')
  
  echo "$AUTH_RESPONSE" | jq -c
  JWT_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.data.accessToken // .accessToken // .token // empty')
fi

if [ -z "$JWT_TOKEN" ]; then
  echo "Could not obtain JWT token. Exiting."
  exit 1
fi

echo ""
echo "Got JWT token: ${JWT_TOKEN:0:20}..."

# Step 2: Get user profile
echo ""
echo "2. Getting user profiles..."
PROFILES=$(curl -s -X GET "$BACKEND_URL/api/v2/profiles" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json")

echo "$PROFILES" | jq -c

PROFILE_ID=$(echo "$PROFILES" | jq -r '.data[0].id // .profiles[0].id // empty')

if [ -z "$PROFILE_ID" ]; then
  echo "No profile found. Creating one..."
  
  CREATE_PROFILE=$(curl -s -X POST "$BACKEND_URL/api/v2/profiles" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "displayName": "MPC Test Profile",
      "username": "mpctest'$(date +%s)'",
      "bio": "Testing MPC operations"
    }')
  
  echo "$CREATE_PROFILE" | jq -c
  PROFILE_ID=$(echo "$CREATE_PROFILE" | jq -r '.data.id // .profile.id // empty')
fi

echo "Profile ID: $PROFILE_ID"

# Step 3: Test MPC operations
echo ""
echo "3. Testing MPC Status endpoint..."
MPC_STATUS=$(curl -s -X GET "$BACKEND_URL/api/v2/mpc/status/$PROFILE_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json")

echo "MPC Status response:"
echo "$MPC_STATUS" | jq

# Step 4: Test MPC Backup
echo ""
echo "4. Testing MPC Backup endpoint..."
BACKUP_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/mpc/backup" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "'$PROFILE_ID'",
    "keyId": "test-key-'$(date +%s)'",
    "rsaPublicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1234567890\n-----END PUBLIC KEY-----",
    "label": "test-backup"
  }')

echo "Backup response:"
echo "$BACKUP_RESPONSE" | jq

# Step 5: Test MPC Export
echo ""
echo "5. Testing MPC Export endpoint..."
EXPORT_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/mpc/export" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "'$PROFILE_ID'",
    "keyId": "test-key-'$(date +%s)'",
    "clientEncKey": "dGVzdC1lbmNyeXB0aW9uLWtleS1mb3ItbXBj"
  }')

echo "Export response:"
echo "$EXPORT_RESPONSE" | jq

# Step 6: Test MPC Rotate
echo ""
echo "6. Testing MPC Rotate endpoint..."
ROTATE_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/mpc/rotate" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "profileId": "'$PROFILE_ID'",
    "oldKeyId": "old-key-'$(date +%s)'",
    "newKeyId": "new-key-'$(date +%s)'"
  }')

echo "Rotate response:"
echo "$ROTATE_RESPONSE" | jq

# Step 7: Check duo-node logs for activity
echo ""
echo "7. Checking duo-node logs for MPC requests..."
gcloud run services logs read interspace-duo-node-dev \
  --limit=50 \
  --region=us-central1 \
  --project=intersend \
  --format="value(timestamp,textPayload)" | grep -v "health" | tail -10

echo ""
echo "=== Test Summary ==="
echo "- JWT Token obtained: $([ -n "$JWT_TOKEN" ] && echo "✓" || echo "✗")"
echo "- Profile ID: $PROFILE_ID"
echo "- Tested endpoints:"
echo "  - GET /api/v2/mpc/status/:profileId"
echo "  - POST /api/v2/mpc/backup"
echo "  - POST /api/v2/mpc/export"
echo "  - POST /api/v2/mpc/rotate"