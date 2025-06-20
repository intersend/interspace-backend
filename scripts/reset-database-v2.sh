#!/bin/bash

# Reset Database Script for V2 Flat Identity Model
# This script drops all data and recreates the database with the new schema

echo "🗑️  Resetting database for V2 Flat Identity Model..."
echo "⚠️  WARNING: This will delete ALL data in the database!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborting..."
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Extract database name from DATABASE_URL
DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')
DB_HOST=$(echo $DATABASE_URL | sed -E 's/postgresql:\/\/[^@]+@([^:\/]+).*/\1/')
DB_USER=$(echo $DATABASE_URL | sed -E 's/postgresql:\/\/([^:]+):.*/\1/')

echo "📊 Database: $DB_NAME"
echo "🏠 Host: $DB_HOST"
echo "👤 User: $DB_USER"
echo ""

# Drop and recreate database
echo "🔴 Dropping database..."
psql -h $DB_HOST -U $DB_USER -c "DROP DATABASE IF EXISTS $DB_NAME;"

echo "🟢 Creating database..."
psql -h $DB_HOST -U $DB_USER -c "CREATE DATABASE $DB_NAME;"

echo "📋 Resetting Prisma migrations..."
rm -rf prisma/migrations
mkdir -p prisma/migrations

echo "🔧 Creating initial migration with flat identity model..."
npx prisma migrate dev --name init_with_flat_identity --create-only

echo "🚀 Applying migrations..."
npx prisma migrate deploy

echo "🌱 Generating Prisma client..."
npx prisma generate

echo "✅ Database reset complete!"
echo ""
echo "📝 Next steps:"
echo "1. Start the backend server: npm run dev"
echo "2. The database is now empty with the new schema"
echo "3. New users will automatically get profiles created"
echo "4. V2 API endpoints are ready to use"