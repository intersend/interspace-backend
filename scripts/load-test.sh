#!/bin/bash
set -e

# Basic load testing script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"

echo -e "${BLUE}🔥 Running Load Tests${NC}"
echo "===================="
echo ""

# Configuration
CONCURRENT_USERS=10
REQUESTS_PER_USER=20
TOTAL_REQUESTS=$((CONCURRENT_USERS * REQUESTS_PER_USER))

echo "Configuration:"
echo "- Target URL: $API_BASE_URL"
echo "- Concurrent users: $CONCURRENT_USERS"
echo "- Requests per user: $REQUESTS_PER_USER"
echo "- Total requests: $TOTAL_REQUESTS"
echo ""

# Check if required tools are available
if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl is required but not installed${NC}"
    exit 1
fi

# Test 1: Health endpoint load test
echo -e "${YELLOW}Test 1: Health Endpoint Load Test${NC}"
echo "Testing endpoint: $API_BASE_URL/health"
echo ""

# Prepare results directory
RESULTS_DIR="/tmp/load-test-results"
rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

# Function to make requests
make_requests() {
    local user_id=$1
    local endpoint=$2
    local output_file="$RESULTS_DIR/user_${user_id}.txt"
    
    for i in $(seq 1 $REQUESTS_PER_USER); do
        start_time=$(date +%s%N)
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null || echo "000")
        end_time=$(date +%s%N)
        
        response_time=$(( ($end_time - $start_time) / 1000000 )) # Convert to ms
        echo "$http_code,$response_time" >> "$output_file"
    done
}

# Start load test
echo "Starting load test..."
start_test=$(date +%s)

# Launch concurrent users
for user in $(seq 1 $CONCURRENT_USERS); do
    make_requests $user "$API_BASE_URL/health" &
done

# Wait for all requests to complete
wait

end_test=$(date +%s)
total_time=$((end_test - start_test))

echo -e "${GREEN}✅ Load test completed in ${total_time}s${NC}"
echo ""

# Analyze results
echo -e "${BLUE}Analyzing Results${NC}"
echo "-----------------"

# Combine all results
cat "$RESULTS_DIR"/*.txt > "$RESULTS_DIR/all_results.txt"

# Calculate statistics
total_requests=$(wc -l < "$RESULTS_DIR/all_results.txt")
successful_requests=$(grep "^200," "$RESULTS_DIR/all_results.txt" | wc -l)
failed_requests=$((total_requests - successful_requests))

# Response times
response_times=$(cut -d',' -f2 "$RESULTS_DIR/all_results.txt" | sort -n)
min_time=$(echo "$response_times" | head -1)
max_time=$(echo "$response_times" | tail -1)
avg_time=$(echo "$response_times" | awk '{sum+=$1} END {print int(sum/NR)}')

# Calculate percentiles
p50=$(echo "$response_times" | awk 'NR==int(NF*0.50)')
p95=$(echo "$response_times" | awk 'NR==int(NF*0.95)')
p99=$(echo "$response_times" | awk 'NR==int(NF*0.99)')

# Requests per second
rps=$(echo "scale=2; $total_requests / $total_time" | bc 2>/dev/null || echo "N/A")

echo "Summary:"
echo "--------"
echo "Total requests: $total_requests"
echo "Successful requests: $successful_requests ($(echo "scale=1; $successful_requests * 100 / $total_requests" | bc 2>/dev/null || echo "N/A")%)"
echo "Failed requests: $failed_requests"
echo "Requests per second: $rps"
echo ""
echo "Response times (ms):"
echo "- Min: ${min_time}ms"
echo "- Avg: ${avg_time}ms"
echo "- Max: ${max_time}ms"
echo "- 50th percentile: ${p50}ms"
echo "- 95th percentile: ${p95}ms"
echo "- 99th percentile: ${p99}ms"
echo ""

# Test 2: Authenticated endpoint load test
echo -e "${YELLOW}Test 2: Authenticated Endpoint Load Test${NC}"

# First, try to get an auth token if BYPASS_LOGIN is enabled
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -E '^BYPASS_LOGIN=' "$PROJECT_ROOT/.env" | xargs)
fi

if [ "$BYPASS_LOGIN" == "true" ]; then
    echo "Getting test authentication token..."
    
    AUTH_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"authStrategy":"test","deviceId":"load-test","deviceName":"Load Test","deviceType":"test"}' \
        "$API_BASE_URL/api/v1/auth/authenticate")
    
    if echo "$AUTH_RESPONSE" | grep -q "accessToken"; then
        ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.accessToken' 2>/dev/null || echo "")
        
        if [ -n "$ACCESS_TOKEN" ]; then
            echo -e "${GREEN}✅ Got authentication token${NC}"
            echo "Testing authenticated endpoint: /api/v1/profiles"
            echo ""
            
            # Run authenticated load test
            make_auth_requests() {
                local user_id=$1
                local output_file="$RESULTS_DIR/auth_user_${user_id}.txt"
                
                for i in $(seq 1 10); do # Fewer requests for auth endpoints
                    start_time=$(date +%s%N)
                    http_code=$(curl -s -o /dev/null -w "%{http_code}" \
                        -H "Authorization: Bearer $ACCESS_TOKEN" \
                        "$API_BASE_URL/api/v1/profiles" 2>/dev/null || echo "000")
                    end_time=$(date +%s%N)
                    
                    response_time=$(( ($end_time - $start_time) / 1000000 ))
                    echo "$http_code,$response_time" >> "$output_file"
                done
            }
            
            echo "Starting authenticated load test..."
            for user in $(seq 1 5); do # Fewer concurrent users for auth
                make_auth_requests $user &
            done
            wait
            
            echo -e "${GREEN}✅ Authenticated load test completed${NC}"
        else
            echo -e "${YELLOW}⚠️  Could not extract token - skipping authenticated test${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Authentication failed - skipping authenticated test${NC}"
    fi
else
    echo -e "${BLUE}ℹ️  BYPASS_LOGIN is not enabled - skipping authenticated test${NC}"
fi
echo ""

# Test 3: Stress test warning
echo -e "${YELLOW}Test 3: Stress Test (Optional)${NC}"
echo "This will send a high volume of requests and may affect server performance."
echo -n "Run stress test? (y/N): "
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running stress test with 50 concurrent users..."
    
    # Simple stress test
    stress_test() {
        local endpoint=$1
        local duration=10 # seconds
        local end_time=$(($(date +%s) + duration))
        local count=0
        
        while [ $(date +%s) -lt $end_time ]; do
            curl -s -o /dev/null "$endpoint" &
            count=$((count + 1))
            
            # Limit background jobs
            if [ $((count % 50)) -eq 0 ]; then
                wait
            fi
        done
        wait
        echo $count
    }
    
    echo "Stress testing for 10 seconds..."
    total_stress_requests=$(stress_test "$API_BASE_URL/health")
    
    echo -e "${GREEN}✅ Stress test completed${NC}"
    echo "Total requests sent: $total_stress_requests"
    echo "Requests per second: $((total_stress_requests / 10))"
else
    echo "Skipping stress test"
fi
echo ""

# Performance recommendations
echo -e "${BLUE}Performance Analysis${NC}"
echo "==================="

if [ "$avg_time" -lt 50 ]; then
    echo -e "${GREEN}✅ Excellent performance (avg < 50ms)${NC}"
elif [ "$avg_time" -lt 200 ]; then
    echo -e "${GREEN}✅ Good performance (avg < 200ms)${NC}"
elif [ "$avg_time" -lt 500 ]; then
    echo -e "${YELLOW}⚠️  Acceptable performance (avg < 500ms)${NC}"
else
    echo -e "${RED}❌ Poor performance (avg > 500ms)${NC}"
fi

if [ "$failed_requests" -gt 0 ]; then
    echo -e "${RED}❌ Failed requests detected - check server capacity${NC}"
fi

if [ "$p99" -gt 1000 ]; then
    echo -e "${YELLOW}⚠️  High 99th percentile latency - investigate slow requests${NC}"
fi

echo ""
echo "Recommendations:"
echo "- Monitor CPU and memory usage during load"
echo "- Check database connection pool settings"
echo "- Review slow query logs"
echo "- Consider caching frequently accessed data"
echo "- Implement request queuing for high load"

# Cleanup
rm -rf "$RESULTS_DIR"

echo ""
echo -e "${GREEN}✅ Load testing completed!${NC}"