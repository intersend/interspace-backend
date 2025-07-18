#!/bin/bash

echo "🚀 Direct SQL Import to Google Cloud"
echo "==================================="

# First, let's clear the existing data using gcloud
echo "🧹 Clearing existing data..."

# Create a temp SQL file for clearing
cat > /tmp/clear-app-store.sql << 'EOF'
DELETE FROM "AppStoreApp";
DELETE FROM "AppStoreCategory";
EOF

# Execute the clear command
echo "Executing clear command..."
gcloud sql databases execute-sql interspace \
    --instance=interspace-db-dev \
    --sql-file=/tmp/clear-app-store.sql \
    --user=postgres

if [ $? -ne 0 ]; then
    echo "❌ Failed to clear data. Trying alternative method..."
    
    # Alternative: Use the database URL directly with the local database
    echo "Setting up local connection..."
    
    # Kill any existing proxy
    pkill -f cloud-sql-proxy
    
    # Start proxy in background
    ./cloud-sql-proxy intersend:us-central1:interspace-db-dev --port 5434 &
    PROXY_PID=$!
    
    # Wait for proxy to start
    sleep 3
    
    # Use the password we set earlier
    export DATABASE_URL="postgresql://postgres:InterspaceCloud2024!@localhost:5434/interspace"
    
    echo "Running import via proxy..."
    npx tsx scripts/import-apps-to-cloud.ts
    
    # Kill proxy
    kill $PROXY_PID
    
    exit 0
fi

# If we get here, the SQL execution worked, so let's import the full data
echo "📱 Importing app data..."
gcloud sql databases execute-sql interspace \
    --instance=interspace-db-dev \
    --sql-file=/tmp/app-store-import.sql \
    --user=postgres

if [ $? -eq 0 ]; then
    echo "✅ Import completed successfully!"
else
    echo "❌ Import failed"
    exit 1
fi