#!/bin/bash

# Setup script for real E2E testing with actual services

set -e

# Load NVM and use Node 20
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 20

echo "🚀 Setting up real E2E test environment..."
echo "Node version: $(node --version)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Check if .env.e2e exists
if [ ! -f ".env.e2e" ]; then
    echo -e "${YELLOW}⚠️  .env.e2e not found. Creating from example...${NC}"
    if [ -f "tests/e2e/config/.env.real.example" ]; then
        cp tests/e2e/config/.env.real.example .env.e2e
        echo -e "${GREEN}✅ Created .env.e2e from example${NC}"
        echo -e "${YELLOW}⚠️  Please edit .env.e2e and add your API keys${NC}"
    else
        echo -e "${RED}❌ Example env file not found${NC}"
        exit 1
    fi
fi

# Load environment variables
export $(cat .env.e2e | grep -v '^#' | xargs)

# Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
npm install

# Build duo-node if needed
echo -e "${GREEN}🔨 Building duo-node...${NC}"
cd ../interspace-duo-node
npm install
cd ../interspace-backend

# Generate Prisma client
echo -e "${GREEN}🗄️  Generating Prisma client...${NC}"
npm run prisma:generate

# Start Docker services
echo -e "${GREEN}🐳 Starting Docker services...${NC}"
docker-compose -f docker-compose.e2e.yml down -v
docker-compose -f docker-compose.e2e.yml up -d postgres-e2e redis-e2e sigpair-db

# Wait for databases to be ready
echo -e "${YELLOW}⏳ Waiting for databases to be ready...${NC}"
sleep 10

# Run database migrations
echo -e "${GREEN}🗄️  Running database migrations...${NC}"
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/interspace_e2e" npm run prisma:deploy

# Start sigpair and duo-node
echo -e "${GREEN}🚀 Starting MPC services...${NC}"
docker-compose -f docker-compose.e2e.yml up -d sigpair duo-node

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for all services to be healthy...${NC}"
attempt=0
max_attempts=30

while [ $attempt -lt $max_attempts ]; do
    if docker-compose -f docker-compose.e2e.yml ps | grep -E "(unhealthy|starting)" > /dev/null; then
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    else
        echo ""
        break
    fi
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}❌ Services failed to become healthy${NC}"
    docker-compose -f docker-compose.e2e.yml ps
    exit 1
fi

# Check service health
echo -e "${GREEN}🏥 Checking service health...${NC}"

# Check PostgreSQL
if docker exec interspace-postgres-e2e pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL is healthy${NC}"
else
    echo -e "${RED}❌ PostgreSQL is not healthy${NC}"
fi

# Check Redis
if docker exec interspace-redis-e2e redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is healthy${NC}"
else
    echo -e "${RED}❌ Redis is not healthy${NC}"
fi

# Check Duo Node
if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Duo Node is healthy${NC}"
else
    echo -e "${RED}❌ Duo Node is not healthy${NC}"
fi

# Check Sigpair
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Sigpair is healthy${NC}"
else
    echo -e "${RED}❌ Sigpair is not healthy${NC}"
fi

echo ""
echo -e "${GREEN}✅ Real E2E environment is ready!${NC}"
echo ""
echo "To run tests with real services:"
echo "  npm run test:e2e -- --testNamePattern=\"Real\""
echo ""
echo "To view logs:"
echo "  docker-compose -f docker-compose.e2e.yml logs -f"
echo ""
echo "To stop services:"
echo "  docker-compose -f docker-compose.e2e.yml down"
echo ""

# Check if API keys are configured
if [ "$ORBY_API_KEY" == "your-real-orby-api-key-here" ]; then
    echo -e "${YELLOW}⚠️  Warning: Orby API key is not configured in .env.e2e${NC}"
    echo -e "${YELLOW}   Orby tests will be skipped${NC}"
fi

# Fund test wallets if requested
if [ "$1" == "--fund-wallets" ]; then
    echo -e "${GREEN}💰 Funding test wallets...${NC}"
    npm run fund-wallets -- --env TEST_WALLET_ADDRESS --env TEST_WALLET_2_ADDRESS
fi