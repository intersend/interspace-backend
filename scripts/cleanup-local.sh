#!/bin/bash
set -e

# Cleanup local development environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Cleaning up local development environment${NC}"
echo "==========================================="
echo ""

echo -e "${YELLOW}⚠️  Warning: This will remove:${NC}"
echo "- Docker containers and volumes"
echo "- Node modules"
echo "- Build artifacts"
echo "- Test databases"
echo "- Temporary files"
echo ""
echo -n "Continue? (y/N): "
read -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cleanup cancelled"
    exit 0
fi
echo ""

cd "$PROJECT_ROOT"

# Step 1: Stop running services
echo -e "${YELLOW}Step 1: Stopping services...${NC}"

# Kill any running Node processes on port 3000
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Stopping Node.js server on port 3000..."
    kill $(lsof -Pi :3000 -sTCP:LISTEN -t) 2>/dev/null || true
    sleep 2
fi

# Stop Docker containers
if docker-compose ps -q 2>/dev/null | grep -q .; then
    echo "Stopping Docker containers..."
    docker-compose down
fi
echo -e "${GREEN}✅ Services stopped${NC}"
echo ""

# Step 2: Clean Docker resources
echo -e "${YELLOW}Step 2: Cleaning Docker resources...${NC}"

# Remove containers
if docker ps -a | grep -q interspace; then
    echo "Removing Interspace containers..."
    docker ps -a | grep interspace | awk '{print $1}' | xargs docker rm -f 2>/dev/null || true
fi

# Remove volumes
if docker volume ls | grep -q interspace; then
    echo "Removing Interspace volumes..."
    docker volume ls | grep interspace | awk '{print $2}' | xargs docker volume rm -f 2>/dev/null || true
fi

# Remove images (optional)
echo -n "Remove Docker images? This will require rebuild (y/N): "
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if docker images | grep -q interspace; then
        echo "Removing Interspace images..."
        docker images | grep interspace | awk '{print $3}' | xargs docker rmi -f 2>/dev/null || true
    fi
fi

echo -e "${GREEN}✅ Docker resources cleaned${NC}"
echo ""

# Step 3: Clean build artifacts
echo -e "${YELLOW}Step 3: Cleaning build artifacts...${NC}"

# Remove dist directory
if [ -d "dist" ]; then
    echo "Removing dist directory..."
    rm -rf dist
fi

# Remove node_modules (optional)
echo -n "Remove node_modules? This will require reinstall (y/N): "
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "node_modules" ]; then
        echo "Removing node_modules..."
        rm -rf node_modules
    fi
    
    # Also remove package-lock.json to ensure clean install
    if [ -f "package-lock.json" ]; then
        echo -n "Remove package-lock.json for fresh install? (y/N): "
        read -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -f package-lock.json
        fi
    fi
fi

# Remove TypeScript build info
rm -f tsconfig.tsbuildinfo

echo -e "${GREEN}✅ Build artifacts cleaned${NC}"
echo ""

# Step 4: Clean test artifacts
echo -e "${YELLOW}Step 4: Cleaning test artifacts...${NC}"

# Remove test databases
if [ -d "prisma" ]; then
    echo "Removing test database files..."
    find prisma -name "test_*.db" -type f -delete 2>/dev/null || true
    find prisma -name "test_*.db-journal" -type f -delete 2>/dev/null || true
fi

# Remove coverage reports
if [ -d "coverage" ]; then
    echo "Removing coverage reports..."
    rm -rf coverage
fi

# Remove test reports
rm -f test-report-*.txt

echo -e "${GREEN}✅ Test artifacts cleaned${NC}"
echo ""

# Step 5: Clean logs and temp files
echo -e "${YELLOW}Step 5: Cleaning logs and temp files...${NC}"

# Remove log files
find . -name "*.log" -type f -delete 2>/dev/null || true

# Remove .env backup files
rm -f .env.backup.*

# Remove OS temp files
find . -name ".DS_Store" -type f -delete 2>/dev/null || true
find . -name "Thumbs.db" -type f -delete 2>/dev/null || true

echo -e "${GREEN}✅ Logs and temp files cleaned${NC}"
echo ""

# Step 6: Reset git (optional)
echo -n "Reset git to clean state? This will discard ALL uncommitted changes (y/N): "
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}⚠️  This will discard ALL uncommitted changes!${NC}"
    echo -n "Are you absolutely sure? Type 'yes' to confirm: "
    read confirm
    if [ "$confirm" == "yes" ]; then
        git clean -fdx
        git reset --hard
        echo -e "${GREEN}✅ Git repository reset to clean state${NC}"
    else
        echo "Git reset cancelled"
    fi
fi
echo ""

# Summary
echo -e "${GREEN}🎉 Cleanup completed!${NC}"
echo ""
echo "Next steps to start fresh:"
echo "1. Run setup script: ./scripts/setup-local.sh"
echo "2. Or manually:"
echo "   - npm install (if node_modules removed)"
echo "   - docker-compose --profile local up -d postgres"
echo "   - npm run prisma:migrate"
echo "   - npm run dev"
echo ""
echo "Cleanup summary:"
echo "- Docker resources cleaned"
echo "- Build artifacts removed"
echo "- Test files cleaned"
echo "- Temp files removed"
echo ""