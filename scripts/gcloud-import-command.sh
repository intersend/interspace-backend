#!/bin/bash

echo "🚀 Google Cloud SQL Direct Import"
echo "================================"
echo ""

# Upload SQL file to Cloud Storage first
BUCKET_NAME="interspace-imports-$(date +%s)"
SQL_FILE="app-store-import.sql"

echo "1️⃣ Creating temporary Cloud Storage bucket..."
gsutil mb gs://$BUCKET_NAME/ 2>/dev/null || true

echo "2️⃣ Uploading SQL file to Cloud Storage..."
gsutil cp scripts/$SQL_FILE gs://$BUCKET_NAME/$SQL_FILE

echo "3️⃣ Importing SQL file to Cloud SQL..."
gcloud sql import sql interspace-db-dev \
  gs://$BUCKET_NAME/$SQL_FILE \
  --database=interspace \
  --user=postgres

echo "4️⃣ Cleaning up Cloud Storage..."
gsutil rm -r gs://$BUCKET_NAME/

echo ""
echo "✅ Import process completed!"
echo ""
echo "To verify the import, you can connect and check:"
echo "gcloud sql connect interspace-db-dev --user=postgres --database=interspace"
echo ""
echo "Then run these SQL commands:"
echo "SELECT COUNT(*) FROM \"AppStoreApp\";"
echo "SELECT name FROM \"AppStoreApp\" WHERE name = 'Fileverse';"