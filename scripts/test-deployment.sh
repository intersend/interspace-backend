#!/bin/bash
set -e

# Comprehensive deployment testing script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Comprehensive Deployment Testing${NC}"
echo "===================================="
echo ""

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test script
run_test() {
    local test_name=$1
    local test_script=$2
    
    echo -e "${YELLOW}Running: $test_name${NC}"
    echo "----------------------------------------"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ -f "$SCRIPT_DIR/$test_script" ]; then
        if "$SCRIPT_DIR/$test_script"; then
            echo -e "${GREEN}✅ $test_name: PASSED${NC}"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo -e "${RED}❌ $test_name: FAILED${NC}"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        echo -e "${YELLOW}⚠️  $test_name: Script not found ($test_script)${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    echo ""
}

# Function to check if server is running
check_server() {
    echo -n "Checking if server is running... "
    if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is running${NC}"
        return 0
    else
        echo -e "${RED}❌ Server is not running${NC}"
        echo -e "${YELLOW}Please start the server with: npm run dev${NC}"
        return 1
    fi
}

# Pre-flight checks
echo -e "${BLUE}Pre-flight Checks${NC}"
echo "-----------------"

# Check prerequisites
if ! "$SCRIPT_DIR/check-prerequisites.sh"; then
    echo -e "${RED}Prerequisites check failed. Aborting tests.${NC}"
    exit 1
fi

# Check environment
if ! "$SCRIPT_DIR/validate-env.sh"; then
    echo -e "${RED}Environment validation failed. Aborting tests.${NC}"
    exit 1
fi

# Check server
if ! check_server; then
    echo ""
    echo -e "${YELLOW}Would you like to start the server in the background? (y/N)${NC}"
    read -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Starting server in background..."
        cd "$PROJECT_ROOT"
        npm run dev > /tmp/interspace-server.log 2>&1 &
        SERVER_PID=$!
        echo "Server PID: $SERVER_PID"
        echo "Waiting for server to start..."
        sleep 5
        if ! check_server; then
            echo -e "${RED}Failed to start server. Check logs at /tmp/interspace-server.log${NC}"
            kill $SERVER_PID 2>/dev/null || true
            exit 1
        fi
        CLEANUP_SERVER=true
    else
        exit 1
    fi
fi
echo ""

# Run test suites
echo -e "${BLUE}Running Test Suites${NC}"
echo "==================="
echo ""

# 1. Smoke tests
run_test "Smoke Tests" "smoke-test.sh"

# 2. Health endpoint tests
run_test "Health Endpoint Tests" "test-health-endpoints.sh"

# 3. Authentication tests
run_test "Authentication Flow Tests" "test-auth-flow.sh"

# 4. Database operation tests
run_test "Database Operation Tests" "test-database-operations.sh"

# 5. MPC integration tests (if enabled)
if [ "${DISABLE_MPC:-true}" != "true" ]; then
    run_test "MPC Integration Tests" "test-mpc-integration.sh"
else
    echo -e "${BLUE}Skipping MPC tests (DISABLE_MPC=true)${NC}"
    echo ""
fi

# 6. Docker container tests
run_test "Docker Container Tests" "test-docker-build.sh"

# 7. Load tests (optional)
echo -e "${YELLOW}Run load tests? This may take a few minutes (y/N)${NC}"
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_test "Load Tests" "load-test.sh"
fi

# Run npm tests if available
echo ""
echo -e "${BLUE}Running npm test suite${NC}"
echo "---------------------"
cd "$PROJECT_ROOT"
if npm test -- --passWithNoTests; then
    echo -e "${GREEN}✅ npm tests: PASSED${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
    echo -e "${RED}❌ npm tests: FAILED${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
fi

# Cleanup
if [ "${CLEANUP_SERVER:-false}" == "true" ]; then
    echo ""
    echo "Stopping test server..."
    kill $SERVER_PID 2>/dev/null || true
fi

# Summary Report
echo ""
echo "========================================"
echo -e "${BLUE}Deployment Test Summary${NC}"
echo "========================================"
echo "Total test suites: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"
echo ""

# Generate report file
REPORT_FILE="$PROJECT_ROOT/test-report-$(date +%Y%m%d-%H%M%S).txt"
{
    echo "Interspace Backend - Deployment Test Report"
    echo "=========================================="
    echo "Date: $(date)"
    echo "Environment: ${NODE_ENV:-development}"
    echo ""
    echo "Test Results:"
    echo "- Total tests: $TOTAL_TESTS"
    echo "- Passed: $PASSED_TESTS"
    echo "- Failed: $FAILED_TESTS"
    echo ""
    echo "System Information:"
    echo "- Node.js: $(node -v)"
    echo "- npm: $(npm -v)"
    echo "- Docker: $(docker --version)"
    echo "- OS: $(uname -s)"
    echo ""
} > "$REPORT_FILE"

echo -e "${BLUE}Test report saved to: $REPORT_FILE${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All deployment tests passed! Ready for deployment.${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please review and fix issues before deployment.${NC}"
    exit 1
fi