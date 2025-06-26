#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting E2E Test Environment${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if interspace-duo-node exists
if [ ! -d "../interspace-duo-node" ]; then
    echo -e "${YELLOW}⚠️  interspace-duo-node not found at ../interspace-duo-node${NC}"
    echo "Please clone the interspace-duo-node repository:"
    echo "  cd .."
    echo "  git clone <duo-node-repo-url> interspace-duo-node"
    exit 1
fi

# Load environment variables
if [ -f .env.e2e ]; then
    echo -e "${GREEN}✅ Loading E2E environment variables${NC}"
    export $(cat .env.e2e | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}⚠️  .env.e2e not found. Using .env.local${NC}"
    if [ -f .env.local ]; then
        export $(cat .env.local | grep -v '^#' | xargs)
    else
        echo -e "${RED}❌ No environment file found${NC}"
        exit 1
    fi
fi

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up...${NC}"
    docker-compose -f docker-compose.e2e.yml down -v
    exit
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Start services with Docker Compose
echo -e "${GREEN}🐳 Starting Docker services...${NC}"
docker-compose -f docker-compose.e2e.yml up -d

# Wait for services to be healthy
echo -e "${GREEN}⏳ Waiting for services to be ready...${NC}"

# Wait for PostgreSQL
until docker exec interspace-postgres-e2e pg_isready -U postgres > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo -e "\n${GREEN}✅ PostgreSQL is ready${NC}"

# Wait for Redis
until docker exec interspace-redis-e2e redis-cli ping > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo -e "${GREEN}✅ Redis is ready${NC}"

# Wait for Duo Node
max_attempts=30
attempt=0
until curl -f http://localhost:3001/health > /dev/null 2>&1; do
    echo -n "."
    sleep 1
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
        echo -e "\n${RED}❌ Duo Node failed to start${NC}"
        echo "Duo Node logs:"
        docker logs interspace-duo-node-e2e
        exit 1
    fi
done
echo -e "\n${GREEN}✅ Duo Node is ready${NC}"

# Update DATABASE_URL for E2E tests
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/interspace_e2e"
export REDIS_URL="redis://localhost:6380"
export DUO_NODE_URL="http://localhost:3001"

# Run database migrations
echo -e "${GREEN}🗄️  Running database migrations...${NC}"
npm run prisma:migrate

# Run E2E tests
echo -e "${GREEN}🧪 Running E2E tests...${NC}"
npm run test:e2e -- "$@"

# Capture exit code
TEST_EXIT_CODE=$?

# Show logs if tests failed
if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo -e "\n${RED}❌ Tests failed. Showing service logs:${NC}"
    echo -e "\n${YELLOW}Duo Node logs:${NC}"
    docker logs --tail 50 interspace-duo-node-e2e
fi

exit $TEST_EXIT_CODE