#!/bin/bash

# Script to run real E2E tests with actual services

set -e

# Load NVM and use Node 20
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20

echo "🚀 Running real E2E tests..."
echo "Node version: $(node --version)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load test environment
if [ -f ".env.e2e" ]; then
    export $(cat .env.e2e | grep -v '^#' | xargs)
else
    echo -e "${RED}❌ .env.e2e not found. Run setup-real-e2e.sh first.${NC}"
    exit 1
fi

# Check if services are running
echo -e "${BLUE}🏥 Checking service health...${NC}"

services_healthy=true

if ! docker exec interspace-postgres-e2e pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${RED}❌ PostgreSQL is not running${NC}"
    services_healthy=false
fi

if ! docker exec interspace-redis-e2e redis-cli ping > /dev/null 2>&1; then
    echo -e "${RED}❌ Redis is not running${NC}"
    services_healthy=false
fi

if ! curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Duo Node is not running${NC}"
    services_healthy=false
fi

if [ "$services_healthy" = false ]; then
    echo -e "${YELLOW}Services are not healthy. Starting them...${NC}"
    ./scripts/setup-real-e2e.sh
fi

# Parse command line arguments
TEST_SUITE="all"
VERBOSE=false
BAIL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --mpc)
            TEST_SUITE="mpc"
            shift
            ;;
        --orby)
            TEST_SUITE="orby"
            shift
            ;;
        --journey)
            TEST_SUITE="journey"
            shift
            ;;
        --transfers)
            TEST_SUITE="transfers"
            shift
            ;;
        --defi)
            TEST_SUITE="defi"
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --bail)
            BAIL=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--mpc|--orby|--journey|--transfers|--defi] [--verbose] [--bail]"
            exit 1
            ;;
    esac
done

# Build Jest command
JEST_CMD="npm run test:e2e -- --runInBand"

if [ "$VERBOSE" = true ]; then
    JEST_CMD="$JEST_CMD --verbose"
fi

if [ "$BAIL" = true ]; then
    JEST_CMD="$JEST_CMD --bail"
fi

# Set real mode
export E2E_REAL_MODE=true

# Run tests based on suite
case $TEST_SUITE in
    mpc)
        echo -e "${BLUE}🔐 Running MPC tests with real Silence Labs...${NC}"
        $JEST_CMD --testNamePattern="Real MPC Operations"
        ;;
    orby)
        echo -e "${BLUE}🌐 Running Orby tests with real API...${NC}"
        $JEST_CMD --testNamePattern="Real Orby Integration"
        ;;
    journey)
        echo -e "${BLUE}🎯 Running user journey tests...${NC}"
        $JEST_CMD --testNamePattern="Real User Journey"
        ;;
    transfers)
        echo -e "${BLUE}💸 Running token transfer tests...${NC}"
        $JEST_CMD --testNamePattern="token transfers|transfer operations"
        ;;
    defi)
        echo -e "${BLUE}💎 Running DeFi tests...${NC}"
        $JEST_CMD --testNamePattern="DeFi|batch operations|delegation"
        ;;
    all)
        echo -e "${BLUE}🏃 Running all real E2E tests...${NC}"
        
        # Run tests in order of importance
        echo -e "\n${YELLOW}1️⃣ MPC Tests${NC}"
        $JEST_CMD --testNamePattern="Real MPC Operations" || true
        
        echo -e "\n${YELLOW}2️⃣ Orby Tests${NC}"
        $JEST_CMD --testNamePattern="Real Orby Integration" || true
        
        echo -e "\n${YELLOW}3️⃣ User Journey Tests${NC}"
        $JEST_CMD --testNamePattern="Real User Journey" || true
        
        echo -e "\n${YELLOW}4️⃣ Transfer Tests${NC}"
        $JEST_CMD --testNamePattern="token transfers|transfer operations" || true
        
        echo -e "\n${YELLOW}5️⃣ DeFi Tests${NC}"
        $JEST_CMD --testNamePattern="DeFi|batch operations|delegation" || true
        ;;
esac

echo -e "\n${GREEN}✅ Test run completed!${NC}"

# Show logs on failure
if [ $? -ne 0 ] && [ "$VERBOSE" = false ]; then
    echo -e "\n${YELLOW}📋 Recent logs from services:${NC}"
    echo -e "\n${BLUE}Duo Node logs:${NC}"
    docker logs --tail 50 interspace-duo-node-e2e
    echo -e "\n${BLUE}Sigpair logs:${NC}"
    docker logs --tail 50 interspace-sigpair-e2e
fi