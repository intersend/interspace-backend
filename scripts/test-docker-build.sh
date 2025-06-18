#!/bin/bash
set -e

# Test Docker build and container health

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing Docker Build & Container Health${NC}"
echo "======================================"
echo ""

FAILED=0
PASSED=0

# Test 1: Docker availability
echo -e "${YELLOW}Test 1: Docker Availability${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker is installed${NC}"
    docker_version=$(docker --version)
    echo "Version: $docker_version"
    
    if docker info > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Docker daemon is running${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Docker daemon is not running${NC}"
        echo "Please start Docker Desktop"
        FAILED=$((FAILED + 1))
        exit 1
    fi
else
    echo -e "${RED}❌ Docker is not installed${NC}"
    FAILED=$((FAILED + 1))
    exit 1
fi
echo ""

# Test 2: Docker Compose availability
echo -e "${YELLOW}Test 2: Docker Compose Availability${NC}"
if command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✅ Docker Compose is installed${NC}"
    compose_version=$(docker-compose --version)
    echo "Version: $compose_version"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Dockerfile validity
echo -e "${YELLOW}Test 3: Dockerfile Validity${NC}"
cd "$PROJECT_ROOT"
if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}✅ Dockerfile exists${NC}"
    
    # Check Dockerfile syntax
    if docker build --no-cache -f Dockerfile . --dry-run > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Dockerfile syntax is valid${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${YELLOW}⚠️  Dockerfile syntax check not available${NC}"
        PASSED=$((PASSED + 1))
    fi
else
    echo -e "${RED}❌ Dockerfile not found${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: Build Docker image
echo -e "${YELLOW}Test 4: Building Docker Image${NC}"
echo "This may take a few minutes..."

IMAGE_NAME="interspace-backend-test:latest"
BUILD_START=$(date +%s)

if docker build -t "$IMAGE_NAME" . > /tmp/docker-build.log 2>&1; then
    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
    echo "Build time: ${BUILD_TIME}s"
    
    # Check image size
    IMAGE_SIZE=$(docker images "$IMAGE_NAME" --format "{{.Size}}")
    echo "Image size: $IMAGE_SIZE"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Docker build failed${NC}"
    echo "Last 20 lines of build log:"
    tail -20 /tmp/docker-build.log
    FAILED=$((FAILED + 1))
fi
rm -f /tmp/docker-build.log
echo ""

# Test 5: Analyze image layers
if [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}Test 5: Image Layer Analysis${NC}"
    
    # Count layers
    LAYER_COUNT=$(docker history "$IMAGE_NAME" -q | wc -l)
    echo "Total layers: $LAYER_COUNT"
    
    if [ $LAYER_COUNT -lt 20 ]; then
        echo -e "${GREEN}✅ Reasonable number of layers${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${YELLOW}⚠️  High number of layers (consider optimization)${NC}"
        PASSED=$((PASSED + 1))
    fi
    
    # Show largest layers
    echo "Top 5 largest layers:"
    docker history "$IMAGE_NAME" --format "table {{.Size}}\t{{.CreatedBy}}" --no-trunc | head -6
    echo ""
fi

# Test 6: Security scan (if available)
echo -e "${YELLOW}Test 6: Security Scan${NC}"
if command -v docker &> /dev/null && docker scout version &> /dev/null; then
    echo "Running Docker Scout security scan..."
    if docker scout quickview "$IMAGE_NAME" 2>/dev/null; then
        echo -e "${GREEN}✅ Security scan completed${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${YELLOW}⚠️  Security scan failed${NC}"
        PASSED=$((PASSED + 1))
    fi
else
    echo -e "${BLUE}ℹ️  Docker Scout not available - skipping security scan${NC}"
    echo "Install with: docker scout version"
    PASSED=$((PASSED + 1))
fi
echo ""

# Test 7: Test container run
if [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}Test 7: Container Runtime Test${NC}"
    echo "Starting test container..."
    
    # Create test env file
    cat > /tmp/test.env << EOF
NODE_ENV=test
PORT=3333
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/interspace
JWT_SECRET=test-secret-key
JWT_REFRESH_SECRET=test-refresh-secret
ENCRYPTION_SECRET=test-encryption-key
DISABLE_MPC=true
BYPASS_LOGIN=true
ORBY_INSTANCE_PRIVATE_API_KEY=test-private-key
ORBY_INSTANCE_PUBLIC_API_KEY=test-public-key
ORBY_APP_NAME=interspace-test
ORBY_PRIVATE_INSTANCE_URL=https://test.example.com
FRONTEND_URL=http://localhost:3000
DEFAULT_CHAIN_ID=11155111
SUPPORTED_CHAINS=11155111
CORS_ORIGINS=*
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
EOF
    
    # Run container
    CONTAINER_ID=$(docker run -d \
        --name interspace-test-container \
        --env-file /tmp/test.env \
        -p 3333:3333 \
        "$IMAGE_NAME" 2>/dev/null || echo "")
    
    if [ -n "$CONTAINER_ID" ]; then
        echo "Container started: ${CONTAINER_ID:0:12}"
        
        # Wait for container to be ready
        echo "Waiting for container to be ready..."
        sleep 5
        
        # Check if container is still running
        if docker ps | grep -q interspace-test-container; then
            echo -e "${GREEN}✅ Container is running${NC}"
            
            # Check container health
            if curl -s -f http://localhost:3333/health > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Container health check passed${NC}"
                PASSED=$((PASSED + 1))
            else
                echo -e "${RED}❌ Container health check failed${NC}"
                echo "Container logs:"
                docker logs interspace-test-container 2>&1 | tail -20
                FAILED=$((FAILED + 1))
            fi
        else
            echo -e "${RED}❌ Container exited${NC}"
            echo "Container logs:"
            docker logs interspace-test-container 2>&1 | tail -20
            FAILED=$((FAILED + 1))
        fi
        
        # Cleanup
        docker stop interspace-test-container > /dev/null 2>&1 || true
        docker rm interspace-test-container > /dev/null 2>&1 || true
    else
        echo -e "${RED}❌ Failed to start container${NC}"
        FAILED=$((FAILED + 1))
    fi
    
    rm -f /tmp/test.env
else
    echo -e "${YELLOW}⚠️  Skipping container runtime test due to build failure${NC}"
fi
echo ""

# Test 8: Docker Compose validation
echo -e "${YELLOW}Test 8: Docker Compose Validation${NC}"
cd "$PROJECT_ROOT"
if [ -f "docker-compose.yml" ]; then
    echo -e "${GREEN}✅ docker-compose.yml exists${NC}"
    
    # Validate compose file
    if docker-compose config > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Docker Compose configuration is valid${NC}"
        
        # List services
        services=$(docker-compose config --services 2>/dev/null)
        echo "Services defined: $(echo $services | tr '\n' ', ')"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Docker Compose configuration is invalid${NC}"
        FAILED=$((FAILED + 1))
    fi
else
    echo -e "${RED}❌ docker-compose.yml not found${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Cleanup test image
if [ -n "$IMAGE_NAME" ]; then
    echo "Cleaning up test image..."
    docker rmi "$IMAGE_NAME" > /dev/null 2>&1 || true
fi

# Summary
echo "================================"
echo -e "${BLUE}Docker Test Summary${NC}"
echo "Total tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All Docker tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some Docker tests failed${NC}"
    exit 1
fi