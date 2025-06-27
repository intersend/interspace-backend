#!/bin/bash

echo "Running Flat Identity Model Tests..."
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test file and track results
run_test() {
    local test_file=$1
    local test_name=$2
    
    echo -e "\n${YELLOW}Running: ${test_name}${NC}"
    echo "----------------------------------------"
    
    if npm test -- "$test_file" --passWithNoTests; then
        echo -e "${GREEN}✓ ${test_name} passed${NC}"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}✗ ${test_name} failed${NC}"
        ((FAILED_TESTS++))
    fi
    ((TOTAL_TESTS++))
}

# Integration Tests
echo -e "\n${YELLOW}=== INTEGRATION TESTS ===${NC}"
run_test "tests/integration/flatIdentityModel.integration.test.ts" "Flat Identity Model Integration Tests"
run_test "tests/integration/authFlowV2.integration.test.js" "Auth Flow V2 Integration Tests"

# Unit Tests
echo -e "\n${YELLOW}=== UNIT TESTS ===${NC}"
run_test "tests/unit/services/accountService.test.js" "Account Service Unit Tests"
run_test "tests/unit/services/accountServiceExtended.test.ts" "Account Service Extended Tests"
run_test "tests/unit/controllers/authControllerV2.test.js" "Auth Controller V2 Unit Tests"
run_test "tests/unit/services/smartProfileService.test.ts" "Smart Profile Service Tests"
run_test "tests/unit/services/linkedAccountService.test.ts" "Linked Account Service Tests"

# Summary
echo -e "\n${YELLOW}=================================="
echo "TEST SUMMARY"
echo "==================================${NC}"
echo -e "Total Tests Run: ${TOTAL_TESTS}"
echo -e "${GREEN}Passed: ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed: ${FAILED_TESTS}${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed! ✨${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed. Please check the output above.${NC}"
    exit 1
fi