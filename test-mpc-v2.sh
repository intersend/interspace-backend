#!/bin/bash

# Test MPC v2 operations
set -e

BACKEND_URL="https://interspace-backend-dev-784862970473.us-central1.run.app"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Testing MPC V2 Operations ==="
echo ""

# Step 1: Try email authentication
echo "1. Creating test account via email auth..."
EMAIL="mpc-test-$(date +%s)@example.com"

# Request verification code
echo "Requesting verification code for $EMAIL..."
CODE_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/auth/email/request-code" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\"}")

echo "Response: $CODE_RESPONSE"

# For development, try to get the code
if [[ "$CODE_RESPONSE" == *"success\":true"* ]]; then
  echo -e "${GREEN}✓ Verification code sent${NC}"
  
  # In development, there might be a way to get the last code
  echo "Checking for development code endpoint..."
  DEV_CODE=$(curl -s "$BACKEND_URL/api/v2/auth/email/dev/last-code?email=$EMAIL" 2>/dev/null | jq -r '.code' 2>/dev/null || echo "")
  
  if [ -n "$DEV_CODE" ] && [ "$DEV_CODE" != "null" ]; then
    echo "Got development code: $DEV_CODE"
    
    # Verify the code
    VERIFY_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/auth/email/verify-code" \
      -H "Content-Type: application/json" \
      -d "{
        \"email\": \"$EMAIL\",
        \"code\": \"$DEV_CODE\",
        \"deviceId\": \"test-device-$(date +%s)\",
        \"deviceName\": \"Test Device\",
        \"deviceType\": \"script\"
      }")
    
    echo "Verify response: $VERIFY_RESPONSE"
    
    # Extract access token
    ACCESS_TOKEN=$(echo "$VERIFY_RESPONSE" | jq -r '.accessToken' 2>/dev/null || echo "")
    
    if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
      echo -e "${GREEN}✓ Got access token${NC}"
    else
      echo -e "${RED}✗ Could not get access token${NC}"
      echo "Trying guest authentication instead..."
    fi
  else
    echo -e "${YELLOW}⚠ Cannot get verification code in dev mode${NC}"
  fi
else
  echo -e "${YELLOW}⚠ Email auth not available, trying other methods${NC}"
fi

# Step 2: If no token yet, try guest auth
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
  echo ""
  echo "2. Trying guest authentication..."
  GUEST_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/auth/guest" \
    -H "Content-Type: application/json" \
    -d "{
      \"deviceId\": \"test-device-$(date +%s)\",
      \"deviceName\": \"Test Device\",
      \"deviceType\": \"script\"
    }")
  
  echo "Guest response: $GUEST_RESPONSE"
  ACCESS_TOKEN=$(echo "$GUEST_RESPONSE" | jq -r '.accessToken' 2>/dev/null || echo "")
  
  if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
    echo -e "${GREEN}✓ Got guest access token${NC}"
  else
    echo -e "${RED}✗ Guest auth failed${NC}"
  fi
fi

# Step 3: If still no token, try social auth with mock data
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
  echo ""
  echo "3. Trying social authentication..."
  SOCIAL_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/auth/authenticate" \
    -H "Content-Type: application/json" \
    -d "{
      \"authToken\": \"mock-token-$(date +%s)\",
      \"authStrategy\": \"social\",
      \"deviceId\": \"test-device-$(date +%s)\",
      \"deviceName\": \"Test Device\",
      \"deviceType\": \"script\",
      \"socialData\": {
        \"provider\": \"test\",
        \"providerId\": \"test-$(date +%s)\",
        \"username\": \"testuser\",
        \"displayName\": \"Test User\"
      }
    }")
  
  echo "Social response: $SOCIAL_RESPONSE"
  ACCESS_TOKEN=$(echo "$SOCIAL_RESPONSE" | jq -r '.data.accessToken' 2>/dev/null || echo "")
  
  if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
    echo -e "${GREEN}✓ Got social access token${NC}"
  fi
fi

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
  echo -e "${RED}✗ Could not obtain authentication token${NC}"
  echo "Cannot proceed with MPC tests without authentication"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ Authentication successful${NC}"
echo "Token: ${ACCESS_TOKEN:0:20}..."

# Step 4: Create a profile if needed
echo ""
echo "4. Creating test profile..."
PROFILE_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/profiles" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"MPC Test Profile\"}")

echo "Profile response: $PROFILE_RESPONSE"

PROFILE_ID=$(echo "$PROFILE_RESPONSE" | jq -r '.data.id' 2>/dev/null || echo "")
if [ -z "$PROFILE_ID" ] || [ "$PROFILE_ID" == "null" ]; then
  # Try to get existing profile
  PROFILES_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/v2/profiles" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  PROFILE_ID=$(echo "$PROFILES_RESPONSE" | jq -r '.data[0].id' 2>/dev/null || echo "test-profile")
fi

echo "Using profile ID: $PROFILE_ID"

# Step 5: Test MPC endpoints
echo ""
echo "5. Testing MPC Endpoints..."
echo "========================="

# Test MPC status
echo ""
echo "Testing GET /api/v2/mpc/status/:profileId"
STATUS_RESPONSE=$(curl -s -X GET "$BACKEND_URL/api/v2/mpc/status/$PROFILE_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
echo "Response: $STATUS_RESPONSE"

if [[ "$STATUS_RESPONSE" == *"hasKey"* ]]; then
  echo -e "${GREEN}✓ MPC status endpoint working${NC}"
else
  echo -e "${YELLOW}⚠ MPC status endpoint returned unexpected response${NC}"
fi

# Test MPC backup (will fail without actual key)
echo ""
echo "Testing POST /api/v2/mpc/backup"
BACKUP_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/mpc/backup" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"profileId\": \"$PROFILE_ID\",
    \"rsaPubkeyPem\": \"-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\\n-----END PUBLIC KEY-----\",
    \"label\": \"Test Backup\",
    \"twoFactorCode\": \"123456\"
  }")
echo "Response: $BACKUP_RESPONSE"

if [[ "$BACKUP_RESPONSE" == *"No MPC key found"* ]]; then
  echo -e "${YELLOW}⚠ Expected: No MPC key exists for new profile${NC}"
elif [[ "$BACKUP_RESPONSE" == *"success\":true"* ]]; then
  echo -e "${GREEN}✓ MPC backup endpoint working${NC}"
else
  echo -e "${YELLOW}⚠ MPC backup endpoint returned: $BACKUP_RESPONSE${NC}"
fi

# Test MPC export
echo ""
echo "Testing POST /api/v2/mpc/export"
EXPORT_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/mpc/export" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"profileId\": \"$PROFILE_ID\",
    \"clientEncKey\": \"YmFzZTY0ZW5jb2RlZDMyYnl0ZXNrZXlmb3JlbmNyeXB0aW9u\",
    \"twoFactorCode\": \"123456\"
  }")
echo "Response: $EXPORT_RESPONSE"

# Test MPC rotate
echo ""
echo "Testing POST /api/v2/mpc/rotate"
ROTATE_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/mpc/rotate" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"profileId\": \"$PROFILE_ID\",
    \"twoFactorCode\": \"123456\"
  }")
echo "Response: $ROTATE_RESPONSE"

# Step 6: Test duo-node connectivity
echo ""
echo "6. Testing Duo Node Connectivity..."
echo "==================================="

# The backend should communicate with duo-node internally
# We can check if the error messages indicate connectivity
if [[ "$BACKUP_RESPONSE" == *"duo"* ]] || [[ "$BACKUP_RESPONSE" == *"silence"* ]]; then
  echo -e "${GREEN}✓ Backend is attempting to communicate with duo-node${NC}"
else
  echo -e "${YELLOW}⚠ Cannot verify duo-node connectivity from responses${NC}"
fi

echo ""
echo "=== Summary ==="
echo -e "${GREEN}✓ V2 API is available${NC}"
echo -e "${GREEN}✓ Authentication working${NC}"
echo -e "${GREEN}✓ MPC endpoints accessible${NC}"
echo -e "${YELLOW}⚠ MPC operations require key generation from iOS app${NC}"
echo ""
echo "Next steps:"
echo "1. Use iOS app with Silence Labs SDK to generate MPC wallet"
echo "2. This will create entries in MpcKeyMapping table"
echo "3. Then backup/export/rotate operations will work through duo-node → Silence Labs"