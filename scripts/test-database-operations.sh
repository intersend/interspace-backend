#!/bin/bash
set -e

# Test database operations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing Database Operations${NC}"
echo "==========================="
echo ""

FAILED=0
PASSED=0

# Load database URL from environment
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/.env" | xargs)
fi

# Test 1: PostgreSQL container status
echo -e "${YELLOW}Test 1: PostgreSQL Container Status${NC}"
if docker ps | grep -q interspace-postgres; then
    echo -e "${GREEN}✅ PostgreSQL container is running${NC}"
    PASSED=$((PASSED + 1))
    
    # Get container info
    echo "Container details:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep postgres || true
else
    echo -e "${RED}❌ PostgreSQL container is not running${NC}"
    FAILED=$((FAILED + 1))
    echo "Run: docker-compose --profile local up -d postgres"
fi
echo ""

# Test 2: Database connectivity
echo -e "${YELLOW}Test 2: Database Connectivity${NC}"
if docker exec interspace-postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL is accepting connections${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ PostgreSQL is not responding${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Database existence
echo -e "${YELLOW}Test 3: Database Existence${NC}"
if docker exec interspace-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw interspace; then
    echo -e "${GREEN}✅ Database 'interspace' exists${NC}"
    PASSED=$((PASSED + 1))
    
    # Get database size
    db_size=$(docker exec interspace-postgres psql -U postgres -d interspace -t -c "SELECT pg_size_pretty(pg_database_size('interspace'));" | tr -d ' ')
    echo "Database size: $db_size"
else
    echo -e "${RED}❌ Database 'interspace' does not exist${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: Prisma schema validity
echo -e "${YELLOW}Test 4: Prisma Schema Validity${NC}"
cd "$PROJECT_ROOT"
if npx prisma validate > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Prisma schema is valid${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Prisma schema validation failed${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 5: Migration status
echo -e "${YELLOW}Test 5: Database Migration Status${NC}"
# Check if migrations table exists
if docker exec interspace-postgres psql -U postgres -d interspace -c "\dt" 2>/dev/null | grep -q "_prisma_migrations"; then
    echo -e "${GREEN}✅ Migrations table exists${NC}"
    
    # Count applied migrations
    migration_count=$(docker exec interspace-postgres psql -U postgres -d interspace -t -c "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" 2>/dev/null | tr -d ' ')
    echo "Applied migrations: $migration_count"
    
    # Check for pending migrations
    cd "$PROJECT_ROOT"
    if npx prisma migrate status 2>&1 | grep -q "Database schema is up to date"; then
        echo -e "${GREEN}✅ Database schema is up to date${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${YELLOW}⚠️  There may be pending migrations${NC}"
        echo "Run: npm run prisma:migrate"
    fi
else
    echo -e "${YELLOW}⚠️  No migrations applied yet${NC}"
    echo "Run: npm run prisma:migrate"
fi
echo ""

# Test 6: Table structure
echo -e "${YELLOW}Test 6: Database Tables${NC}"
tables=$(docker exec interspace-postgres psql -U postgres -d interspace -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;" 2>/dev/null | grep -v "^$" | wc -l)
if [ "$tables" -gt 0 ]; then
    echo -e "${GREEN}✅ Found $tables tables in database${NC}"
    PASSED=$((PASSED + 1))
    
    echo "Tables:"
    docker exec interspace-postgres psql -U postgres -d interspace -c "\dt public.*" 2>/dev/null | grep -E "^ public" || true
else
    echo -e "${YELLOW}⚠️  No tables found in database${NC}"
    echo "Run migrations: npm run prisma:migrate"
fi
echo ""

# Test 7: Connection pool test
echo -e "${YELLOW}Test 7: Connection Pool Test${NC}"
echo "Testing multiple simultaneous connections..."

# Create a simple Node.js script to test connection pooling
cat > /tmp/test-db-pool.js << 'EOF'
const { PrismaClient } = require('@prisma/client');

async function testConnectionPool() {
    const clients = [];
    const promises = [];
    
    // Create 5 Prisma clients
    for (let i = 0; i < 5; i++) {
        const prisma = new PrismaClient();
        clients.push(prisma);
        
        // Run a simple query
        promises.push(
            prisma.$queryRaw`SELECT 1 as test`
                .then(() => ({ success: true, client: i }))
                .catch(err => ({ success: false, client: i, error: err.message }))
        );
    }
    
    // Wait for all queries
    const results = await Promise.all(promises);
    
    // Disconnect all clients
    await Promise.all(clients.map(client => client.$disconnect()));
    
    return results;
}

testConnectionPool()
    .then(results => {
        const successful = results.filter(r => r.success).length;
        console.log(JSON.stringify({ total: results.length, successful, results }));
        process.exit(successful === results.length ? 0 : 1);
    })
    .catch(err => {
        console.error(JSON.stringify({ error: err.message }));
        process.exit(1);
    });
EOF

cd "$PROJECT_ROOT"
if node /tmp/test-db-pool.js > /tmp/pool-test-result.json 2>&1; then
    echo -e "${GREEN}✅ Connection pool test passed${NC}"
    if command -v jq &> /dev/null; then
        jq . /tmp/pool-test-result.json
    fi
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Connection pool test failed${NC}"
    cat /tmp/pool-test-result.json 2>/dev/null || echo "No output"
    FAILED=$((FAILED + 1))
fi
rm -f /tmp/test-db-pool.js /tmp/pool-test-result.json
echo ""

# Test 8: Database performance
echo -e "${YELLOW}Test 8: Database Performance${NC}"
echo "Running simple performance test..."

# Test query performance
start_time=$(date +%s%N)
docker exec interspace-postgres psql -U postgres -d interspace -c "SELECT 1;" > /dev/null 2>&1
end_time=$(date +%s%N)
elapsed=$(( ($end_time - $start_time) / 1000000 ))

echo "Simple query time: ${elapsed}ms"
if [ $elapsed -lt 100 ]; then
    echo -e "${GREEN}✅ Excellent query performance${NC}"
    PASSED=$((PASSED + 1))
elif [ $elapsed -lt 500 ]; then
    echo -e "${YELLOW}⚠️  Acceptable query performance${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}❌ Poor query performance${NC}"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 9: Test database
echo -e "${YELLOW}Test 9: Test Database Setup${NC}"
if docker exec interspace-postgres psql -U postgres -lqt | cut -d \| -f 1 | grep -qw interspace_test; then
    echo -e "${GREEN}✅ Test database 'interspace_test' exists${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}⚠️  Test database does not exist${NC}"
    echo "Creating test database..."
    if docker exec interspace-postgres psql -U postgres -c "CREATE DATABASE interspace_test;"; then
        echo -e "${GREEN}✅ Test database created${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ Failed to create test database${NC}"
        FAILED=$((FAILED + 1))
    fi
fi
echo ""

# Summary
echo "================================"
echo -e "${BLUE}Database Test Summary${NC}"
echo "Total tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

# Additional info
echo "Database connection info:"
echo "- Host: localhost"
echo "- Port: 5432"
echo "- Database: interspace"
echo "- User: postgres"
echo "- URL: postgresql://postgres:postgres@localhost:5432/interspace"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All database tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some database tests failed${NC}"
    echo ""
    echo "Common fixes:"
    echo "1. Start PostgreSQL: docker-compose --profile local up -d postgres"
    echo "2. Run migrations: npm run prisma:migrate"
    echo "3. Check logs: docker-compose logs postgres"
    exit 1
fi