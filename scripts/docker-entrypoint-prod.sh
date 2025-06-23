#!/bin/sh
set -e

echo "🚀 Starting Interspace Backend (Production)..."

# Check for required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set"
  exit 1
fi

if [ -z "$JWT_SECRET" ]; then
  echo "❌ ERROR: JWT_SECRET is not set"
  exit 1
fi

if [ -z "$ENCRYPTION_SECRET" ]; then
  echo "❌ ERROR: ENCRYPTION_SECRET is not set"
  exit 1
fi

# Run migrations if enabled
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "🔄 Running database migrations..."
  npm run prisma:migrate:deploy || {
    echo "❌ Migration failed"
    exit 1
  }
  echo "✅ Migrations completed"
fi

# Start the application
echo "🚀 Starting application on port ${PORT:-3000}..."
exec "$@"