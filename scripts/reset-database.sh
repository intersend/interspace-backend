#!/bin/bash
set -e

# Reset database to clean state

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Database Reset Script${NC}"
echo "======================="
echo ""

echo -e "${YELLOW}⚠️  Warning: This will:${NC}"
echo "- Drop and recreate the database"
echo "- Remove all data"
echo "- Re-run all migrations"
echo "- Reset to a clean state"
echo ""
echo -n "Continue? (y/N): "
read -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Database reset cancelled"
    exit 0
fi
echo ""

cd "$PROJECT_ROOT"

# Check if PostgreSQL is running
echo -e "${YELLOW}Checking PostgreSQL...${NC}"
if ! docker ps | grep -q interspace-postgres; then
    echo "PostgreSQL is not running. Starting it..."
    docker-compose --profile local up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to start..."
    MAX_ATTEMPTS=30
    ATTEMPT=0
    while ! docker exec interspace-postgres pg_isready -U postgres > /dev/null 2>&1; do
        ATTEMPT=$((ATTEMPT + 1))
        if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
            echo -e "${RED}❌ PostgreSQL failed to start${NC}"
            exit 1
        fi
        echo -n "."
        sleep 1
    done
    echo ""
fi
echo -e "${GREEN}✅ PostgreSQL is running${NC}"
echo ""

# Step 1: Backup current database (optional)
echo -n "Create backup of current database? (Y/n): "
read -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    BACKUP_FILE="$PROJECT_ROOT/backups/interspace_backup_$(date +%Y%m%d_%H%M%S).sql"
    mkdir -p "$PROJECT_ROOT/backups"
    
    echo "Creating backup..."
    if docker exec interspace-postgres pg_dump -U postgres interspace > "$BACKUP_FILE" 2>/dev/null; then
        echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
    else
        echo -e "${YELLOW}⚠️  Backup failed (database might be empty)${NC}"
    fi
fi
echo ""

# Step 2: Drop existing database
echo -e "${YELLOW}Step 1: Dropping existing database...${NC}"
docker exec interspace-postgres psql -U postgres -c "DROP DATABASE IF EXISTS interspace;" 2>/dev/null || true
docker exec interspace-postgres psql -U postgres -c "DROP DATABASE IF EXISTS interspace_test;" 2>/dev/null || true
echo -e "${GREEN}✅ Databases dropped${NC}"
echo ""

# Step 3: Create new database
echo -e "${YELLOW}Step 2: Creating fresh database...${NC}"
docker exec interspace-postgres psql -U postgres -c "CREATE DATABASE interspace;"
docker exec interspace-postgres psql -U postgres -c "CREATE DATABASE interspace_test;"
echo -e "${GREEN}✅ Databases created${NC}"
echo ""

# Step 4: Clear Prisma migrations history (optional)
echo -n "Reset Prisma migration history? (y/N): "
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Clearing migration history..."
    rm -rf "$PROJECT_ROOT/prisma/migrations"
    mkdir -p "$PROJECT_ROOT/prisma/migrations"
    echo -e "${GREEN}✅ Migration history cleared${NC}"
    
    # Create initial migration
    echo "Creating initial migration..."
    npm run prisma migrate dev --name init
else
    # Just run existing migrations
    echo -e "${YELLOW}Step 3: Running migrations...${NC}"
    npm run prisma:migrate
fi
echo -e "${GREEN}✅ Migrations completed${NC}"
echo ""

# Step 5: Seed data (optional)
echo -n "Add seed data? (y/N): "
read -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Check if seed script exists
    if [ -f "$PROJECT_ROOT/prisma/seed.ts" ] || [ -f "$PROJECT_ROOT/prisma/seed.js" ]; then
        echo "Running seed script..."
        npm run prisma:seed 2>/dev/null || npx prisma db seed
        echo -e "${GREEN}✅ Seed data added${NC}"
    else
        echo -e "${YELLOW}Creating basic seed data...${NC}"
        
        # Create a simple seed script
        cat > "$PROJECT_ROOT/prisma/seed-temp.js" << 'EOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Create test user
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      isGuest: false,
      emailVerified: true,
    },
  });
  
  console.log('Created test user:', user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF
        
        node "$PROJECT_ROOT/prisma/seed-temp.js"
        rm -f "$PROJECT_ROOT/prisma/seed-temp.js"
        echo -e "${GREEN}✅ Basic seed data created${NC}"
    fi
fi
echo ""

# Step 6: Verify database state
echo -e "${YELLOW}Verifying database state...${NC}"

# Count tables
TABLE_COUNT=$(docker exec interspace-postgres psql -U postgres -d interspace -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
echo "Tables created: $TABLE_COUNT"

# Show tables
echo "Database tables:"
docker exec interspace-postgres psql -U postgres -d interspace -c "\dt public.*" 2>/dev/null | grep -E "^ public" || echo "No tables found"

echo ""
echo -e "${GREEN}🎉 Database reset completed!${NC}"
echo ""
echo "Database is now in a clean state with:"
echo "- Fresh database structure"
echo "- All migrations applied"
echo "- No data (unless seeded)"
echo ""
echo "Next steps:"
echo "1. Start the server: npm run dev"
echo "2. Run tests: npm test"
echo "3. Begin development!"
echo ""