#!/bin/bash
set -e

# Check prerequisites for local development

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

MISSING_DEPS=0

# Function to check if a command exists
check_command() {
    local cmd=$1
    local name=$2
    local install_hint=$3
    
    if command -v "$cmd" &> /dev/null; then
        local version=$($cmd --version 2>&1 | head -n1 || echo "version unknown")
        echo -e "${GREEN}✅ $name: $version${NC}"
    else
        echo -e "${RED}❌ $name: Not found${NC}"
        echo -e "   Install hint: $install_hint"
        MISSING_DEPS=$((MISSING_DEPS + 1))
    fi
}

# Function to check Node.js version
check_node_version() {
    if command -v node &> /dev/null; then
        local node_version=$(node -v | sed 's/v//')
        local major_version=$(echo $node_version | cut -d. -f1)
        
        if [ "$major_version" -ge 18 ]; then
            echo -e "${GREEN}✅ Node.js: v$node_version${NC}"
        else
            echo -e "${YELLOW}⚠️  Node.js: v$node_version (version 18+ recommended)${NC}"
            MISSING_DEPS=$((MISSING_DEPS + 1))
        fi
    else
        echo -e "${RED}❌ Node.js: Not found${NC}"
        echo -e "   Install hint: Install from https://nodejs.org or use nvm"
        MISSING_DEPS=$((MISSING_DEPS + 1))
    fi
}

# Function to check if Docker is running
check_docker_running() {
    if command -v docker &> /dev/null; then
        if docker info > /dev/null 2>&1; then
            local docker_version=$(docker --version)
            echo -e "${GREEN}✅ Docker: $docker_version (running)${NC}"
        else
            echo -e "${YELLOW}⚠️  Docker: Installed but not running${NC}"
            echo -e "   Please start Docker Desktop"
            MISSING_DEPS=$((MISSING_DEPS + 1))
        fi
    else
        echo -e "${RED}❌ Docker: Not found${NC}"
        echo -e "   Install hint: Download from https://www.docker.com/products/docker-desktop"
        MISSING_DEPS=$((MISSING_DEPS + 1))
    fi
}

# Check required tools
echo "Required tools:"
echo "--------------"
check_node_version
check_command "npm" "npm" "Comes with Node.js"
check_docker_running
check_command "docker-compose" "Docker Compose" "Comes with Docker Desktop or install separately"
check_command "git" "Git" "Install from https://git-scm.com"
echo ""

# Check optional but recommended tools
echo "Optional tools:"
echo "--------------"
check_command "psql" "PostgreSQL client" "brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
check_command "jq" "jq (JSON processor)" "brew install jq (macOS) or apt-get install jq (Linux)"
check_command "curl" "curl" "Usually pre-installed, or install via package manager"
check_command "openssl" "OpenSSL" "Usually pre-installed, or install via package manager"
echo ""

# Check for .env file
echo "Configuration files:"
echo "-------------------"
if [ -f "$(dirname "$0")/../.env" ]; then
    echo -e "${GREEN}✅ .env file exists${NC}"
else
    echo -e "${YELLOW}⚠️  .env file not found (will be created from template)${NC}"
fi

if [ -f "$(dirname "$0")/../.env.example" ]; then
    echo -e "${GREEN}✅ .env.example file exists${NC}"
else
    echo -e "${RED}❌ .env.example file not found${NC}"
    MISSING_DEPS=$((MISSING_DEPS + 1))
fi
echo ""

# Check ports availability
echo "Port availability:"
echo "-----------------"
check_port() {
    local port=$1
    local service=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port $port: In use (required for $service)${NC}"
        echo -e "   Run: lsof -i :$port to see what's using it"
    else
        echo -e "${GREEN}✅ Port $port: Available ($service)${NC}"
    fi
}

check_port 3000 "Backend API"
check_port 5432 "PostgreSQL"
echo ""

# Summary
echo "================================"
if [ $MISSING_DEPS -eq 0 ]; then
    echo -e "${GREEN}✅ All prerequisites satisfied!${NC}"
    exit 0
else
    echo -e "${RED}❌ Missing $MISSING_DEPS prerequisites${NC}"
    echo -e "${YELLOW}Please install missing dependencies before continuing.${NC}"
    exit 1
fi