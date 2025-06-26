#!/bin/sh
set -e

echo "🚀 Starting Interspace Backend..."

# Kill any existing process on port 3000 inside the container
echo "🔍 Checking for processes on port 3000..."
if lsof -ti:3000 > /dev/null 2>&1; then
  echo "⚠️  Found process on port 3000, killing it..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  sleep 2
fi

# Check if node_modules needs updating
if [ ! -d "node_modules/express-validator" ] || [ ! -d "node_modules/@simplewebauthn/types" ]; then
  echo "📦 Installing missing dependencies..."
  npm install
fi

# Apply OrbyProvider patch
echo "🔧 Applying OrbyProvider patch..."
npm run patch:orby

# Always regenerate Prisma client to ensure types are in sync
echo "🔧 Regenerating Prisma client..."
npm run prisma:generate

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