#!/bin/bash
set -e

# Quick smoke test for basic functionality

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

echo -e "${BLUE}🔥 Running smoke tests...${NC}"
echo "API Base URL: $API_BASE_URL"
echo ""

FAILED_TESTS=0
PASSED_TESTS=0

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local expected_status=$3
    local description=$4
    local data=$5
    
    echo -n "Testing $description... "
    
    if [ -z "$data" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$endpoint")
    else
        response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$endpoint")
    fi
    
    if [ "$response" -eq "$expected_status" ]; then
        echo -e "${GREEN}✅ Passed (HTTP $response)${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ Failed (Expected: $expected_status, Got: $response)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Function to test endpoint with response validation
test_endpoint_json() {
    local method=$1
    local endpoint=$2
    local expected_status=$3
    local description=$4
    local json_check=$5
    
    echo -n "Testing $description... "
    
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$endpoint")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        if [ -n "$json_check" ] && command -v jq &> /dev/null; then
            if echo "$body" | jq -e "$json_check" > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Passed (HTTP $http_code, JSON valid)${NC}"
                PASSED_TESTS=$((PASSED_TESTS + 1))
            else
                echo -e "${RED}❌ Failed (HTTP $http_code OK, but JSON check failed)${NC}"
                FAILED_TESTS=$((FAILED_TESTS + 1))
            fi
        else
            echo -e "${GREEN}✅ Passed (HTTP $http_code)${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        fi
    else
        echo -e "${RED}❌ Failed (Expected: $expected_status, Got: $http_code)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Test 1: Health check endpoints
echo -e "${YELLOW}1. Health Check Tests${NC}"
echo "---------------------"
test_endpoint_json "GET" "$API_BASE_URL/health" 200 "Basic health check" '.status == "healthy" or .status == "unhealthy"'
test_endpoint_json "GET" "$API_BASE_URL/health/detailed" 200 "Detailed health check" '.checks'
test_endpoint_json "GET" "$API_BASE_URL/health/database" 200 "Database health check" '.database'
test_endpoint_json "GET" "$API_BASE_URL/health/mpc" 200 "MPC health check" '.status'
test_endpoint_json "GET" "$API_BASE_URL/ping" 200 "Ping endpoint" '.success == true'
echo ""

# Test 2: API version check
echo -e "${YELLOW}2. API Version Tests${NC}"
echo "--------------------"
test_endpoint "GET" "$API_URL" 200 "API root endpoint"
echo ""

# Test 3: Authentication endpoints
echo -e "${YELLOW}3. Authentication Tests${NC}"
echo "-----------------------"
test_endpoint "POST" "$API_URL/auth/authenticate" 400 "Auth without body (should fail)"

# Test authentication with minimal data
AUTH_DATA='{"authStrategy":"test","deviceId":"smoke-test-device","deviceName":"Smoke Test","deviceType":"test"}'
test_endpoint "POST" "$API_URL/auth/authenticate" 401 "Auth with test strategy" "$AUTH_DATA"
echo ""

# Test 4: Profile endpoints (should require auth)
echo -e "${YELLOW}4. Profile Endpoint Tests${NC}"
echo "-------------------------"
test_endpoint "GET" "$API_URL/profiles" 401 "Get profiles (no auth)"
test_endpoint "POST" "$API_URL/profiles" 401 "Create profile (no auth)"
test_endpoint "GET" "$API_URL/profiles/current" 401 "Get current profile (no auth)"
echo ""

# Test 5: Other protected endpoints
echo -e "${YELLOW}5. Protected Endpoint Tests${NC}"
echo "---------------------------"
test_endpoint "GET" "$API_URL/apps" 401 "Get apps (no auth)"
test_endpoint "GET" "$API_URL/folders" 401 "Get folders (no auth)"
test_endpoint "GET" "$API_URL/linked-accounts" 401 "Get linked accounts (no auth)"
test_endpoint "GET" "$API_URL/user" 401 "Get user info (no auth)"
echo ""

# Test 6: CORS headers
echo -e "${YELLOW}6. CORS Tests${NC}"
echo "-------------"
echo -n "Testing CORS headers... "
cors_response=$(curl -s -I -X OPTIONS "$API_URL" -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" | grep -i "access-control-allow-origin" || echo "")
if [ -n "$cors_response" ]; then
    echo -e "${GREEN}✅ CORS headers present${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ CORS headers missing${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# Test 7: Database connectivity (via health check)
echo -e "${YELLOW}7. Database Connectivity${NC}"
echo "-----------------------"
echo -n "Checking database connection... "
db_health=$(curl -s "$API_BASE_URL/health/database" | jq -r '.database.connected' 2>/dev/null || echo "false")
if [ "$db_health" == "true" ]; then
    echo -e "${GREEN}✅ Database connected${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ Database not connected${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi
echo ""

# Summary
echo "================================"
echo -e "${BLUE}Smoke Test Summary:${NC}"
echo "Total tests: $((PASSED_TESTS + FAILED_TESTS))"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All smoke tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please check the server logs.${NC}"
    echo ""
    echo "Common issues:"
    echo "- Is the server running? (npm run dev)"
    echo "- Is the database running? (docker-compose ps)"
    echo "- Are all environment variables set correctly?"
    echo "- Check server logs for errors"
    exit 1
fi