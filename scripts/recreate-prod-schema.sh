#!/bin/bash
set -e

echo "🚀 Starting production database schema recreation..."
echo "⚠️  WARNING: This will drop and recreate all tables!"
echo ""

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: prisma/schema.prisma not found. Please run from the project root."
    exit 1
fi

# Load production environment
export NODE_ENV=production

# First, let's create a simple SQL script to drop all tables
echo "📝 Creating SQL script to drop all tables..."
cat > drop_all_tables.sql << 'EOF'
-- Drop all tables in the public schema
DO $$ DECLARE
    r RECORD;
BEGIN
    -- Disable foreign key checks
    SET session_replication_role = 'replica';
    
    -- Drop all tables
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    
    -- Re-enable foreign key checks
    SET session_replication_role = 'origin';
END $$;

-- Verify all tables are dropped
SELECT COUNT(*) as table_count FROM pg_tables WHERE schemaname = 'public';
EOF

echo "✅ SQL script created"
echo ""

# Now let's use Prisma to push the schema (this will create all tables fresh)
echo "🔄 Applying Prisma schema to production database..."
echo "This will create all tables defined in schema.prisma"
echo ""

# Use prisma db push instead of migrate for a fresh schema
npx prisma db push --skip-generate

echo ""
echo "✅ Schema recreation complete!"
echo ""

# Clean up
rm -f drop_all_tables.sql

echo "🔍 Verifying tables were created..."
npx prisma db execute --stdin << 'EOF'
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
EOF

echo ""
echo "✅ Production database schema recreation complete!"