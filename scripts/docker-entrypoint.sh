#!/bin/sh
set -e

echo "🚀 Starting Interspace Backend..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until nc -z postgres 5432; do
  sleep 1
done
echo "✅ Database is ready!"

# Run migrations
echo "🔄 Running database migrations..."
npm run prisma:deploy || {
  echo "⚠️  Migration failed, trying development migration..."
  npm run prisma:migrate
}

echo "✅ Migrations completed!"

# Start the application
echo "🎯 Starting application..."
exec "$@"