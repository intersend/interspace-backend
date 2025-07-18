#!/bin/bash

# Simple direct import to Google Cloud SQL
echo "🚀 Direct Import to Google Cloud SQL (Simplest Method)"
echo "===================================================="

# Check if password is provided as argument
DB_PASSWORD=$1

if [ -z "$DB_PASSWORD" ]; then
    echo "Please provide database password as argument:"
    echo "Usage: ./scripts/import-cloud-simple.sh YOUR_PASSWORD"
    exit 1
fi

# Set the Cloud SQL connection string
export DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@/interspace?host=/cloudsql/intersend:us-central1:interspace-db-dev"

echo "✅ Database URL configured for Cloud SQL socket connection"
echo ""

# Run the import script
echo "📱 Importing apps..."
npx tsx scripts/import-apps-to-cloud.ts

# Check if import was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Import completed successfully!"
    echo ""
    echo "🔍 Verifying import..."
    npx tsx scripts/verify-cloud-apps.ts
else
    echo "❌ Import failed!"
    exit 1
fi

echo ""
echo "✅ All done! Your Google Cloud database now has all 44 apps."
echo ""
echo "Next steps:"
echo "1. Deploy your backend if not already deployed"
echo "2. Clear any caches: ./scripts/clear-cloud-cache.sh"
echo "3. Test in your iOS app"