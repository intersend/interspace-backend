#!/bin/bash

# Run Real E2E Tests Script
# This script runs all real E2E tests with actual services

set -e

echo "🚀 Starting Real E2E Test Suite"
echo "================================"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run a test suite
run_test() {
    local test_name=$1
    local test_file=$2
    
    echo -e "\n${YELLOW}Running: ${test_name}${NC}"
    echo "----------------------------"
    
    if npm test -- "$test_file" --testTimeout=300000; then
        echo -e "${GREEN}✅ ${test_name} passed${NC}"
        return 0
    else
        echo -e "${RED}❌ ${test_name} failed${NC}"
        return 1
    fi
}

# Check if .env.e2e.real exists
if [ ! -f ".env.e2e.real" ]; then
    echo -e "${RED}Error: .env.e2e.real not found!${NC}"
    echo "Please copy .env.e2e.real.example and configure with real credentials"
    exit 1
fi

# Start Docker services
echo -e "\n${YELLOW}Starting Docker services...${NC}"
docker-compose -f docker-compose.e2e.yml up -d postgres-e2e redis-e2e duo-node

# Wait for services to be ready
echo -e "\n${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Run database migrations
echo -e "\n${YELLOW}Running database migrations...${NC}"
NODE_ENV=test npx prisma db push --skip-generate

# Track test results
total_tests=0
passed_tests=0
failed_tests=0

# Run each test suite
echo -e "\n${YELLOW}Starting test execution...${NC}"

# 1. MPC Operations Tests
if run_test "MPC Operations" "tests/e2e/real/realMpcOperations.test.ts"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi
((total_tests++))

# 2. Orby Integration Tests
if run_test "Orby Integration" "tests/e2e/real/realOrbyOperations.test.ts"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi
((total_tests++))

# 3. Batch Operations Tests
if run_test "Batch Operations" "tests/e2e/real/realBatchOperations.test.ts"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi
((total_tests++))

# 4. Delegation Flow Tests
if run_test "Delegation Flow" "tests/e2e/real/realDelegationFlow.test.ts"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi
((total_tests++))

# 5. User Journey Tests
if run_test "User Journey" "tests/e2e/real/realUserJourney.test.ts"; then
    ((passed_tests++))
else
    ((failed_tests++))
fi
((total_tests++))

# Summary
echo -e "\n================================"
echo -e "${YELLOW}Test Summary${NC}"
echo "================================"
echo -e "Total tests: ${total_tests}"
echo -e "${GREEN}Passed: ${passed_tests}${NC}"
echo -e "${RED}Failed: ${failed_tests}${NC}"

if [ $failed_tests -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit_code=0
else
    echo -e "\n${RED}❌ Some tests failed${NC}"
    exit_code=1
fi

# Cleanup (optional)
read -p "Do you want to stop Docker services? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Stopping Docker services...${NC}"
    docker-compose -f docker-compose.e2e.yml down
fi

exit $exit_code