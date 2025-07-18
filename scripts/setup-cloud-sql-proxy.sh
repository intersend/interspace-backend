#!/bin/bash

# Setup Cloud SQL Proxy for interspace-backend-dev
# This script helps connect to your Google Cloud SQL database

echo "🚀 Setting up Cloud SQL Proxy for interspace-backend-dev"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "❌ Not authenticated with gcloud. Please run:"
    echo "   gcloud auth login"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No project set. Please run:"
    echo "   gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "✅ Using project: $PROJECT_ID"

# Download Cloud SQL Proxy if not exists
if [ ! -f "./cloud-sql-proxy" ]; then
    echo "📥 Downloading Cloud SQL Proxy..."
    curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.11.0/cloud-sql-proxy.darwin.amd64
    chmod +x cloud-sql-proxy
    echo "✅ Cloud SQL Proxy downloaded"
fi

# Get Cloud SQL instance connection name
echo "🔍 Looking for Cloud SQL instances..."
INSTANCE_CONNECTION_NAME=$(gcloud sql instances list --format="value(connectionName)" | grep -E "interspace|dev" | head -1)

if [ -z "$INSTANCE_CONNECTION_NAME" ]; then
    echo "❌ No Cloud SQL instance found. Available instances:"
    gcloud sql instances list --format="table(name,connectionName)"
    echo ""
    echo "Please enter your Cloud SQL instance connection name (format: project:region:instance):"
    read INSTANCE_CONNECTION_NAME
fi

echo "✅ Using Cloud SQL instance: $INSTANCE_CONNECTION_NAME"

# Start Cloud SQL Proxy in background
echo "🔄 Starting Cloud SQL Proxy..."
./cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port 5433 &
PROXY_PID=$!

# Wait for proxy to start
sleep 3

# Check if proxy is running
if ! ps -p $PROXY_PID > /dev/null; then
    echo "❌ Failed to start Cloud SQL Proxy"
    exit 1
fi

echo "✅ Cloud SQL Proxy running on port 5433 (PID: $PROXY_PID)"

# Get database credentials
echo ""
echo "📝 Database connection info needed:"
echo "   - Database name (default: interspace)"
echo "   - Username (default: postgres)"
echo "   - Password"

# Create .env.cloud file
cat > .env.cloud << EOF
# Google Cloud SQL connection via proxy
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5433/interspace"
NODE_ENV=production
EOF

echo ""
echo "✅ Cloud SQL Proxy is running!"
echo ""
echo "Next steps:"
echo "1. Edit .env.cloud and add your database password"
echo "2. Run the import script:"
echo "   DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@localhost:5433/interspace' npx tsx scripts/import-apps-to-cloud.ts"
echo ""
echo "To stop the proxy:"
echo "   kill $PROXY_PID"
echo ""
echo "Or use this one-liner to import directly (replace YOUR_PASSWORD):"
echo "   DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@localhost:5433/interspace' npx tsx scripts/import-apps-to-cloud.ts"