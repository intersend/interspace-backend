#!/bin/bash
set -e

echo "Starting database migration..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "Database URL is configured"

# Run Prisma migrations
echo "Applying Prisma migrations..."
npx prisma migrate deploy

echo "Migration completed successfully"

# Optional: Generate Prisma client (in case it's needed)
echo "Generating Prisma client..."
npx prisma generate

echo "All migration tasks completed successfully"