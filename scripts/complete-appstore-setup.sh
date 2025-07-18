#!/bin/bash

echo "🚀 Completing App Store Public Database Setup"
echo "==========================================="

# Configuration
INSTANCE_NAME="interspace-appstore-public"
DB_NAME="appstore"
DB_USER="appstore_user"
DB_USER_PASSWORD="AppStoreUser2024!"

# Check if instance exists and is ready
echo "Checking instance status..."
INSTANCE_STATE=$(gcloud sql instances describe $INSTANCE_NAME --format="value(state)" 2>/dev/null)

if [ -z "$INSTANCE_STATE" ]; then
    echo "❌ Instance $INSTANCE_NAME not found!"
    echo "Please run ./scripts/create-public-appstore-db.sh first"
    exit 1
fi

if [ "$INSTANCE_STATE" != "RUNNABLE" ]; then
    echo "⏳ Instance is in state: $INSTANCE_STATE"
    echo "Waiting for instance to be ready..."
    while [ "$(gcloud sql instances describe $INSTANCE_NAME --format='value(state)')" != "RUNNABLE" ]; do
        echo -n "."
        sleep 5
    done
    echo " Ready!"
fi

# Get instance IP
INSTANCE_IP=$(gcloud sql instances describe $INSTANCE_NAME --format="value(ipAddresses[0].ipAddress)")
echo "✅ Instance is ready at IP: $INSTANCE_IP"

# Create database if not exists
echo ""
echo "Creating database..."
gcloud sql databases create $DB_NAME --instance=$INSTANCE_NAME 2>/dev/null || echo "Database already exists"

# Create user if not exists
echo ""
echo "Creating user..."
gcloud sql users create $DB_USER --instance=$INSTANCE_NAME --password=$DB_USER_PASSWORD 2>/dev/null || echo "User already exists"

# Add to .env file
echo ""
echo "Adding APPSTORE_DATABASE_URL to .env..."
APPSTORE_URL="postgresql://$DB_USER:$DB_USER_PASSWORD@$INSTANCE_IP:5432/$DB_NAME"

if grep -q "APPSTORE_DATABASE_URL" .env; then
    echo "APPSTORE_DATABASE_URL already exists in .env"
else
    echo "" >> .env
    echo "# Public App Store Database" >> .env
    echo "APPSTORE_DATABASE_URL=\"$APPSTORE_URL\"" >> .env
    echo "✅ Added to .env"
fi

# Generate Prisma client
echo ""
echo "Generating Prisma client for app store..."
npm run prisma:appstore:generate

# Run migrations
echo ""
echo "Running migrations..."
npx prisma migrate deploy --schema=./prisma/schema.appstore.prisma

# Import apps
echo ""
echo "Ready to import apps!"
echo "Run: npm run appstore:import"
echo ""
echo "✅ Setup complete!"
echo ""
echo "Connection details:"
echo "==================="
echo "Public IP: $INSTANCE_IP"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Password: $DB_USER_PASSWORD"
echo "URL: $APPSTORE_URL"