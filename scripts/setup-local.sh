#!/bin/bash
set -e

# Interspace Backend - Local Development Setup Script
# This script sets up a complete local development environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Interspace Backend - Local Development Setup${NC}"
echo "================================================"
echo ""

# Step 1: Check prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"
if ! "$SCRIPT_DIR/check-prerequisites.sh"; then
    echo -e "${RED}❌ Prerequisites check failed. Please install missing dependencies.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Step 2: Generate environment file if it doesn't exist
echo -e "${YELLOW}Step 2: Setting up environment configuration...${NC}"
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "Creating .env file from template..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    
    # Generate secure secrets
    echo "Generating secure secrets..."
    "$SCRIPT_DIR/generate-secrets.sh"
    echo -e "${GREEN}✅ Environment file created with secure secrets${NC}"
else
    echo -e "${BLUE}ℹ️  .env file already exists${NC}"
    read -p "Do you want to regenerate secrets? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        "$SCRIPT_DIR/generate-secrets.sh"
        echo -e "${GREEN}✅ Secrets regenerated${NC}"
    fi
fi
echo ""

# Step 3: Validate environment variables
echo -e "${YELLOW}Step 3: Validating environment variables...${NC}"
if ! "$SCRIPT_DIR/validate-env.sh"; then
    echo -e "${RED}❌ Environment validation failed${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Environment validation passed${NC}"
echo ""

# Step 4: Start Docker services
echo -e "${YELLOW}Step 4: Starting Docker services...${NC}"
cd "$PROJECT_ROOT"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

# Start PostgreSQL
echo "Starting PostgreSQL container..."
docker-compose --profile local up -d postgres

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0
while ! docker exec interspace-postgres pg_isready -U postgres > /dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        docker-compose logs postgres
        exit 1
    fi
    echo -n "."
    sleep 1
done
echo ""
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"
echo ""

# Step 5: Setup database
echo -e "${YELLOW}Step 5: Setting up database...${NC}"
"$SCRIPT_DIR/setup-database.sh"
echo -e "${GREEN}✅ Database setup completed${NC}"
echo ""

# Step 6: Install Node dependencies
echo -e "${YELLOW}Step 6: Installing Node.js dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 7: Generate Prisma client
echo -e "${YELLOW}Step 7: Generating Prisma client...${NC}"
npm run prisma:generate
echo -e "${GREEN}✅ Prisma client generated${NC}"
echo ""

# Step 8: Run database migrations
echo -e "${YELLOW}Step 8: Running database migrations...${NC}"
npm run prisma:migrate
echo -e "${GREEN}✅ Database migrations completed${NC}"
echo ""

# Step 9: Run initial tests
echo -e "${YELLOW}Step 9: Running smoke tests...${NC}"
if "$SCRIPT_DIR/smoke-test.sh"; then
    echo -e "${GREEN}✅ Smoke tests passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some smoke tests failed (this might be expected for initial setup)${NC}"
fi
echo ""

# Step 10: Display setup summary
echo -e "${GREEN}🎉 Local development environment setup completed!${NC}"
echo ""
echo "Summary:"
echo "--------"
echo "✅ Prerequisites installed"
echo "✅ Environment configured"
echo "✅ PostgreSQL running"
echo "✅ Database initialized"
echo "✅ Dependencies installed"
echo "✅ Prisma client generated"
echo "✅ Migrations applied"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Start the development server: ${GREEN}npm run dev${NC}"
echo "2. View logs: ${GREEN}docker-compose logs -f postgres${NC}"
echo "3. Access database: ${GREEN}docker exec -it interspace-postgres psql -U postgres -d interspace${NC}"
echo "4. Run tests: ${GREEN}npm test${NC}"
echo "5. View API docs: ${GREEN}http://localhost:3000/api/v1/docs${NC}"
echo ""
echo -e "${YELLOW}Important notes:${NC}"
echo "- Database URL: postgresql://postgres:postgres@localhost:5432/interspace"
echo "- API Base URL: http://localhost:3000/api/v1"
echo "- Health Check: http://localhost:3000/health"
echo "- Default BYPASS_LOGIN is set to false for security"
echo ""
echo -e "${BLUE}For testing with MPC disabled, set DISABLE_MPC=true in .env${NC}"
echo -e "${BLUE}For testing with auth bypass, set BYPASS_LOGIN=true in .env${NC}"
echo ""
echo "Happy coding! 🚀"