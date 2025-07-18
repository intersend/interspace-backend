#!/bin/bash

echo "🚀 Setting up App Store Public Database"
echo "====================================="

# Run the Cloud SQL creation script
echo "Step 1: Creating Cloud SQL instance..."
./scripts/create-public-appstore-db.sh

if [ $? -ne 0 ]; then
    echo "❌ Failed to create Cloud SQL instance"
    exit 1
fi

echo ""
echo "Step 2: Waiting for instance to be ready..."
sleep 30

echo ""
echo "Step 3: Generating Prisma client for app store..."
npm run prisma:appstore:generate

echo ""
echo "Step 4: Creating initial migration..."
npx prisma migrate dev --schema=./prisma/schema.appstore.prisma --name init

echo ""
echo "✅ App Store database setup complete!"
echo ""
echo "Next steps:"
echo "1. Add APPSTORE_DATABASE_URL to your .env file"
echo "2. Run: npm run import:appstore"
echo "3. Deploy your backend with the new environment variable"