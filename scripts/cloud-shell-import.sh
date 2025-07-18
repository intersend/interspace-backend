#!/bin/bash
# Run this in Google Cloud Shell

echo "🚀 Cloud Shell App Store Import"
echo "=============================="

# Clone your repo in Cloud Shell
git clone https://github.com/YOUR_USERNAME/interspace-codebase.git
cd interspace-codebase/interspace-backend

# Install dependencies
npm install

# Set the database URL (Cloud SQL socket connection)
export DATABASE_URL="postgresql://postgres:InterspaceCloud2024!@/interspace_dev?host=/cloudsql/intersend:us-central1:interspace-db-dev"

# Download the apps JSON
wget https://raw.githubusercontent.com/YOUR_USERNAME/apps-data/main/web3-apps-extended.json -O /tmp/web3-apps-extended.json

# Run the import
npx tsx scripts/import-apps-to-cloud.ts /tmp/web3-apps-extended.json

echo "✅ Import complete!"