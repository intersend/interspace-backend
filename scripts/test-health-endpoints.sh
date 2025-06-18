#!/bin/bash
set -e

# Test all health check endpoints

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo -e "${BLUE}Testing Health Check Endpoints${NC}"
echo "=============================="
echo ""

FAILED=0
PASSED=0

# Function to test health endpoint
test_health_endpoint() {
    local endpoint=$1
    local description=$2
    local expected_fields=$3
    
    echo -e "${YELLOW}Testing: $description${NC}"
    echo "Endpoint: $endpoint"
    
    # Make request and capture response
    response=$(curl -s -w "\n%{http_code}" "$endpoint" 2>/dev/null || echo "000")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # Check HTTP status
    if [[ "$http_code" =~ ^(200|503)$ ]]; then
        echo -e "${GREEN}✅ HTTP Status: $http_code${NC}"
        
        # Validate JSON
        if command -v jq &> /dev/null; then
            if echo "$body" | jq . > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Valid JSON response${NC}"
                
                # Check expected fields
                if [ -n "$expected_fields" ]; then
                    IFS=',' read -ra fields <<< "$expected_fields"
                    for field in "${fields[@]}"; do
                        if echo "$body" | jq -e ".$field" > /dev/null 2>&1; then
                            value=$(echo "$body" | jq -r ".$field")
                            echo -e "${GREEN}✅ Field '$field': $value${NC}"
                        else
                            echo -e "${RED}❌ Missing field: $field${NC}"
                            FAILED=$((FAILED + 1))
                        fi
                    done
                fi
                
                # Pretty print response
                echo -e "${BLUE}Response:${NC}"
                echo "$body" | jq '.' 2>/dev/null || echo "$body"
                PASSED=$((PASSED + 1))
            else
                echo -e "${RED}❌ Invalid JSON response${NC}"
                echo "Response: $body"
                FAILED=$((FAILED + 1))
            fi
        else
            echo -e "${YELLOW}⚠️  jq not installed - skipping JSON validation${NC}"
            echo "Response: $body"
            PASSED=$((PASSED + 1))
        fi
    else
        echo -e "${RED}❌ Unexpected HTTP status: $http_code${NC}"
        echo "Response: $body"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

# Test 1: Basic health check
test_health_endpoint \
    "$API_BASE_URL/health" \
    "Basic Health Check" \
    "status,timestamp,version,environment,database"

# Test 2: Detailed health check
test_health_endpoint \
    "$API_BASE_URL/health/detailed" \
    "Detailed Health Check" \
    "status,timestamp,checks"

# Test 3: Database health check
test_health_endpoint \
    "$API_BASE_URL/health/database" \
    "Database Health Check" \
    "status,responseTime,timestamp"

# Test 4: MPC health check
test_health_endpoint \
    "$API_BASE_URL/health/mpc" \
    "MPC Services Health Check" \
    "status,timestamp"

# Test 5: Performance check
echo -e "${YELLOW}Testing: Response Time Performance${NC}"
echo "Measuring average response time over 10 requests..."

total_time=0
for i in {1..10}; do
    start_time=$(date +%s%N)
    curl -s "$API_BASE_URL/health" > /dev/null
    end_time=$(date +%s%N)
    elapsed=$((($end_time - $start_time) / 1000000)) # Convert to milliseconds
    total_time=$((total_time + elapsed))
    echo -n "."
done
echo ""

avg_time=$((total_time / 10))
echo "Average response time: ${avg_time}ms"

if [ $avg_time -lt 100 ]; then
    echo -e "${GREEN}✅ Excellent performance (<100ms)${NC}"
    PASSED=$((PASSED + 1))
elif [ $avg_time -lt 500 ]; then
    echo -e "${YELLOW}⚠️  Acceptable performance (<500ms)${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Poor performance (>500ms)${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 6: Concurrent requests
echo -e "${YELLOW}Testing: Concurrent Request Handling${NC}"
echo "Sending 5 concurrent requests..."

# Send concurrent requests
for i in {1..5}; do
    curl -s "$API_BASE_URL/health" > /tmp/health_response_$i.txt 2>&1 &
done

# Wait for all requests to complete
wait

# Check all responses
concurrent_success=true
for i in {1..5}; do
    if grep -q "status" /tmp/health_response_$i.txt 2>/dev/null; then
        echo -e "${GREEN}✅ Request $i succeeded${NC}"
    else
        echo -e "${RED}❌ Request $i failed${NC}"
        concurrent_success=false
    fi
    rm -f /tmp/health_response_$i.txt
done

if [ "$concurrent_success" = true ]; then
    echo -e "${GREEN}✅ All concurrent requests handled successfully${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Some concurrent requests failed${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 7: Error conditions
echo -e "${YELLOW}Testing: Error Handling${NC}"

# Test invalid endpoint
echo -n "Testing 404 response... "
http_code=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL/health/invalid")
if [ "$http_code" -eq 404 ]; then
    echo -e "${GREEN}✅ Correct 404 response${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Unexpected status: $http_code${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Summary
echo "================================"
echo -e "${BLUE}Health Endpoint Test Summary${NC}"
echo "Total tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All health endpoint tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some health endpoint tests failed${NC}"
    exit 1
fi