#!/bin/bash

echo "📱 Direct Google Cloud SQL Import"
echo "================================"
echo ""
echo "This will connect directly to your Cloud SQL instance and import the apps."
echo "Password: InterspaceCloud2024!"
echo ""

# Execute the SQL file directly using gcloud
echo "Connecting to Cloud SQL and importing data..."
echo ""

gcloud sql connect interspace-db-dev \
  --user=postgres \
  --database=interspace \
  < scripts/app-store-import.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Import completed successfully!"
    echo ""
    echo "To verify, run:"
    echo "gcloud sql connect interspace-db-dev --user=postgres --database=interspace"
    echo "Then run: SELECT COUNT(*) FROM \"AppStoreApp\";"
else
    echo "❌ Import failed!"
fi