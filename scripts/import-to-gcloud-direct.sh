#!/bin/bash

# Direct import to Google Cloud SQL for interspace-backend-dev
echo "🚀 Direct Import to Google Cloud SQL Database"
echo "========================================"

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed"
    exit 1
fi

# List available Cloud SQL instances
echo "📋 Available Cloud SQL instances:"
gcloud sql instances list --format="table(name,connectionName,primaryIpAddress)"

echo ""
echo "Enter your Cloud SQL instance name (e.g., interspace-backend-dev):"
read INSTANCE_NAME

echo "Enter database name (default: interspace):"
read DB_NAME
DB_NAME=${DB_NAME:-interspace}

echo "Enter database user (default: postgres):"
read DB_USER
DB_USER=${DB_USER:-postgres}

echo "Enter database password:"
read -s DB_PASSWORD

# Build DATABASE_URL
# For Cloud SQL, we need to get the connection details
INSTANCE_DETAILS=$(gcloud sql instances describe $INSTANCE_NAME --format=json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to get instance details for: $INSTANCE_NAME"
    exit 1
fi

# Extract connection info
PROJECT_ID=$(echo $INSTANCE_DETAILS | jq -r '.project')
REGION=$(echo $INSTANCE_DETAILS | jq -r '.region')
CONNECTION_NAME="$PROJECT_ID:$REGION:$INSTANCE_NAME"

echo ""
echo "✅ Instance found: $CONNECTION_NAME"

# Option 1: Use Cloud SQL Proxy (recommended)
echo ""
echo "Starting Cloud SQL Proxy..."
cloud-sql-proxy $CONNECTION_NAME --port 5433 &
PROXY_PID=$!

# Wait for proxy to start
sleep 3

# Check if proxy is running
if ! ps -p $PROXY_PID > /dev/null; then
    echo "❌ Failed to start Cloud SQL Proxy"
    echo "Trying alternative method..."
    
    # Option 2: Direct psql import
    echo "Importing using gcloud sql connect..."
    
    # First, copy the import script to a temp SQL file
    cat > /tmp/import-apps.sql << 'EOF'
-- Clear existing data
DELETE FROM "AppStoreApp";
DELETE FROM "AppStoreCategory";

-- Insert categories
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES
(gen_random_uuid(), 'DeFi', 'defi', 'Decentralized Finance applications', '💰', 1, true, NOW(), NOW()),
(gen_random_uuid(), 'Tools', 'tools', 'Utilities and productivity tools', '🛠️', 2, true, NOW(), NOW()),
(gen_random_uuid(), 'Gaming', 'gaming', 'Web3 gaming and metaverse', '🎮', 3, true, NOW(), NOW()),
(gen_random_uuid(), 'NFT', 'nft', 'NFT marketplaces and tools', '🖼️', 4, true, NOW(), NOW()),
(gen_random_uuid(), 'DAO', 'dao', 'Decentralized Autonomous Organizations', '🏛️', 5, true, NOW(), NOW()),
(gen_random_uuid(), 'Social', 'social', 'Social platforms and communities', '💬', 6, true, NOW(), NOW()),
(gen_random_uuid(), 'Bridge', 'bridge', 'Cross-chain bridges', '🌉', 7, true, NOW(), NOW()),
(gen_random_uuid(), 'Gambling', 'gambling', 'Gambling and prediction markets', '🎲', 8, true, NOW(), NOW()),
(gen_random_uuid(), 'Charity', 'charity', 'Charitable applications', '❤️', 9, true, NOW(), NOW()),
(gen_random_uuid(), 'Utilities', 'utilities', 'Utility applications', '⚙️', 10, true, NOW(), NOW());

-- Note: Apps will need to be inserted separately due to the dynamic category IDs
EOF
    
    echo "Running SQL import..."
    gcloud sql connect $INSTANCE_NAME --user=$DB_USER --database=$DB_NAME < /tmp/import-apps.sql
    
    echo "❌ Manual SQL import completed, but apps need to be imported via the TypeScript script"
    echo "Please use the Cloud SQL Proxy method instead"
    exit 1
fi

# Run the import script with the proxy
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5433/$DB_NAME"

echo ""
echo "Running import script..."
DATABASE_URL="$DATABASE_URL" npx tsx scripts/import-apps-to-cloud.ts

# Kill the proxy
kill $PROXY_PID

echo ""
echo "✅ Import complete!"
echo ""
echo "To verify in your iOS app:"
echo "1. Make sure your backend is deployed with the latest code"
echo "2. Clear app store cache if needed"
echo "3. Restart your iOS app"