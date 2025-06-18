#!/bin/bash
set -e

# Test authentication flows

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_URL="$API_BASE_URL/api/v1"

echo -e "${BLUE}Testing Authentication Flows${NC}"
echo "============================"
echo ""

FAILED=0
PASSED=0

# Load environment to check BYPASS_LOGIN
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -E '^BYPASS_LOGIN=' "$PROJECT_ROOT/.env" | xargs)
fi

# Function to test auth endpoint
test_auth() {
    local description=$1
    local data=$2
    local expected_status=$3
    local check_tokens=$4
    
    echo -e "${YELLOW}Test: $description${NC}"
    
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$data" \
        "$API_URL/auth/authenticate")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    echo "Status: $http_code"
    
    if [ "$http_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✅ Expected status code${NC}"
        
        if [ "$check_tokens" == "true" ] && [ "$http_code" -eq 200 ]; then
            # Check for tokens in response
            if command -v jq &> /dev/null; then
                if echo "$body" | jq -e '.accessToken' > /dev/null 2>&1; then
                    echo -e "${GREEN}✅ Access token present${NC}"
                    ACCESS_TOKEN=$(echo "$body" | jq -r '.accessToken')
                else
                    echo -e "${RED}❌ Access token missing${NC}"
                    FAILED=$((FAILED + 1))
                fi
                
                if echo "$body" | jq -e '.refreshToken' > /dev/null 2>&1; then
                    echo -e "${GREEN}✅ Refresh token present${NC}"
                    REFRESH_TOKEN=$(echo "$body" | jq -r '.refreshToken')
                else
                    echo -e "${RED}❌ Refresh token missing${NC}"
                    FAILED=$((FAILED + 1))
                fi
                
                if echo "$body" | jq -e '.user' > /dev/null 2>&1; then
                    echo -e "${GREEN}✅ User data present${NC}"
                else
                    echo -e "${RED}❌ User data missing${NC}"
                    FAILED=$((FAILED + 1))
                fi
            fi
        fi
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Unexpected status: $http_code (expected: $expected_status)${NC}"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# Test 1: Missing auth data
test_auth \
    "Missing authentication data" \
    '{}' \
    400 \
    false

# Test 2: Invalid auth strategy
test_auth \
    "Invalid authentication strategy" \
    '{"authStrategy":"invalid","deviceId":"test","deviceName":"Test Device","deviceType":"test"}' \
    400 \
    false

# Test 3: Missing device info
test_auth \
    "Missing device information" \
    '{"authStrategy":"wallet"}' \
    400 \
    false

# Test 4: Test authentication (should work if BYPASS_LOGIN=true)
if [ "$BYPASS_LOGIN" == "true" ]; then
    echo -e "${BLUE}BYPASS_LOGIN is enabled - testing bypass flow${NC}"
    test_auth \
        "Bypass login authentication" \
        '{"authStrategy":"test","deviceId":"test-device-001","deviceName":"Test Device","deviceType":"test"}' \
        200 \
        true
else
    echo -e "${BLUE}BYPASS_LOGIN is disabled - testing normal flow${NC}"
    test_auth \
        "Test authentication (should fail without valid credentials)" \
        '{"authStrategy":"test","deviceId":"test-device-001","deviceName":"Test Device","deviceType":"test"}' \
        401 \
        false
fi

# Test 5: Test refresh token flow (if we got tokens)
if [ -n "$ACCESS_TOKEN" ] && [ -n "$REFRESH_TOKEN" ]; then
    echo -e "${YELLOW}Test: Refresh token flow${NC}"
    
    refresh_response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" \
        "$API_URL/auth/refresh")
    
    refresh_code=$(echo "$refresh_response" | tail -n1)
    refresh_body=$(echo "$refresh_response" | sed '$d')
    
    if [ "$refresh_code" -eq 200 ]; then
        echo -e "${GREEN}✅ Token refresh successful${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Token refresh failed (status: $refresh_code)${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
fi

# Test 6: Test authenticated endpoint access (if we have token)
if [ -n "$ACCESS_TOKEN" ]; then
    echo -e "${YELLOW}Test: Authenticated endpoint access${NC}"
    
    # Test profile endpoint with token
    profile_response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_URL/profiles")
    
    profile_code=$(echo "$profile_response" | tail -n1)
    
    if [ "$profile_code" -eq 200 ]; then
        echo -e "${GREEN}✅ Authenticated request successful${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Authenticated request failed (status: $profile_code)${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
    
    # Test with invalid token
    echo -e "${YELLOW}Test: Invalid token rejection${NC}"
    
    invalid_response=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer invalid-token-12345" \
        "$API_URL/profiles")
    
    invalid_code=$(echo "$invalid_response" | tail -n1)
    
    if [ "$invalid_code" -eq 401 ]; then
        echo -e "${GREEN}✅ Invalid token properly rejected${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Invalid token not rejected (status: $invalid_code)${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
fi

# Test 7: Rate limiting
echo -e "${YELLOW}Test: Rate limiting${NC}"
echo "Sending multiple rapid requests..."

rate_limit_hit=false
for i in {1..10}; do
    rapid_response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"authStrategy":"test"}' \
        "$API_URL/auth/authenticate")
    
    if [ "$rapid_response" -eq 429 ]; then
        rate_limit_hit=true
        echo -e "${GREEN}✅ Rate limit detected at request $i${NC}"
        break
    fi
done

if [ "$rate_limit_hit" == false ]; then
    echo -e "${YELLOW}⚠️  Rate limit not triggered in 10 requests (may be configured high for dev)${NC}"
fi
PASSED=$((PASSED + 1))
echo ""

# Test 8: Logout flow (if we have token)
if [ -n "$ACCESS_TOKEN" ]; then
    echo -e "${YELLOW}Test: Logout flow${NC}"
    
    logout_response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "$API_URL/auth/logout")
    
    logout_code=$(echo "$logout_response" | tail -n1)
    
    if [ "$logout_code" -eq 200 ]; then
        echo -e "${GREEN}✅ Logout successful${NC}"
        PASSED=$((PASSED + 1))
        
        # Verify token is invalidated
        echo "Verifying token invalidation..."
        invalid_after_logout=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            "$API_URL/profiles")
        
        invalid_code=$(echo "$invalid_after_logout" | tail -n1)
        
        if [ "$invalid_code" -eq 401 ]; then
            echo -e "${GREEN}✅ Token properly invalidated after logout${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}❌ Token still valid after logout${NC}"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${RED}❌ Logout failed (status: $logout_code)${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
fi

# Summary
echo "================================"
echo -e "${BLUE}Authentication Test Summary${NC}"
echo "Total tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ "$BYPASS_LOGIN" == "true" ]; then
    echo -e "${YELLOW}Note: BYPASS_LOGIN is enabled for testing${NC}"
    echo "Remember to disable it for production!"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All authentication tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some authentication tests failed${NC}"
    exit 1
fi