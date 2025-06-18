#!/bin/bash
set -e

# Setup database for local development

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Setting up database...${NC}"
echo ""

# Check if PostgreSQL container is running
if ! docker ps | grep -q interspace-postgres; then
    echo -e "${RED}❌ PostgreSQL container is not running${NC}"
    echo "Please run: docker-compose --profile local up -d postgres"
    exit 1
fi

# Wait for PostgreSQL to be ready
echo "Checking PostgreSQL connection..."
MAX_ATTEMPTS=30
ATTEMPT=0
while ! docker exec interspace-postgres pg_isready -U postgres > /dev/null 2>&1; do
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo -e "${RED}❌ PostgreSQL is not responding${NC}"
        exit 1
    fi
    echo -n "."
    sleep 1
done
echo ""
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Check if database exists
echo "Checking if database exists..."
if docker exec interspace-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw interspace; then
    echo -e "${GREEN}✅ Database 'interspace' already exists${NC}"
else
    echo "Creating database 'interspace'..."
    docker exec interspace-postgres psql -U postgres -c "CREATE DATABASE interspace;"
    echo -e "${GREEN}✅ Database created${NC}"
fi

# Create test database if it doesn't exist
echo "Checking test database..."
if docker exec interspace-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw interspace_test; then
    echo -e "${GREEN}✅ Test database 'interspace_test' already exists${NC}"
else
    echo "Creating test database 'interspace_test'..."
    docker exec interspace-postgres psql -U postgres -c "CREATE DATABASE interspace_test;"
    echo -e "${GREEN}✅ Test database created${NC}"
fi

# Grant permissions
echo "Setting up database permissions..."
docker exec interspace-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE interspace TO postgres;" 2>/dev/null || true
docker exec interspace-postgres psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE interspace_test TO postgres;" 2>/dev/null || true
echo -e "${GREEN}✅ Permissions configured${NC}"

# Check database size and tables
echo ""
echo "Database information:"
echo "-------------------"
docker exec interspace-postgres psql -U postgres -d interspace -c "\l+ interspace" | grep interspace || true
echo ""

# Count tables if any exist
TABLE_COUNT=$(docker exec interspace-postgres psql -U postgres -d interspace -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "Current tables in database: $TABLE_COUNT"
    docker exec interspace-postgres psql -U postgres -d interspace -c "\dt public.*" 2>/dev/null || true
else
    echo "Database is empty (no tables yet)"
fi

echo ""
echo -e "${GREEN}✅ Database setup completed${NC}"
echo ""
echo "Connection details:"
echo "==================="
echo "Host: localhost"
echo "Port: 5432"
echo "Database: interspace"
echo "Username: postgres"
echo "Password: postgres"
echo "URL: postgresql://postgres:postgres@localhost:5432/interspace"
echo ""
echo "Test database URL: postgresql://postgres:postgres@localhost:5432/interspace_test"
echo ""
echo -e "${BLUE}You can connect using:${NC}"
echo "psql: docker exec -it interspace-postgres psql -U postgres -d interspace"
echo "pgAdmin: Use the connection details above"
echo ""