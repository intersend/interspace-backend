#!/bin/bash

echo "🚀 Creating Public App Store Database on Google Cloud SQL"
echo "========================================================"

# Configuration
INSTANCE_NAME="interspace-appstore-public"
REGION="us-central1"
DB_VERSION="POSTGRES_15"
TIER="db-f1-micro"  # Small instance for app store data
ROOT_PASSWORD="AppStore2024Public!"
DB_NAME="appstore"
DB_USER="appstore_user"
DB_USER_PASSWORD="AppStoreUser2024!"

echo "Instance: $INSTANCE_NAME"
echo "Region: $REGION"
echo "Database: $DB_NAME"
echo ""

# Step 1: Create Cloud SQL instance with public IP
echo "📦 Creating Cloud SQL instance..."
gcloud sql instances create $INSTANCE_NAME \
  --database-version=$DB_VERSION \
  --tier=$TIER \
  --region=$REGION \
  --assign-ip \
  --authorized-networks=0.0.0.0/0 \
  --root-password=$ROOT_PASSWORD

if [ $? -ne 0 ]; then
    echo "❌ Failed to create instance"
    exit 1
fi

# Step 2: Create database
echo ""
echo "📊 Creating database..."
gcloud sql databases create $DB_NAME --instance=$INSTANCE_NAME

# Step 3: Create user
echo ""
echo "👤 Creating database user..."
gcloud sql users create $DB_USER \
  --instance=$INSTANCE_NAME \
  --password=$DB_USER_PASSWORD

# Step 4: Get instance details
echo ""
echo "📋 Getting instance details..."
INSTANCE_IP=$(gcloud sql instances describe $INSTANCE_NAME \
  --format="value(ipAddresses[0].ipAddress)")

echo ""
echo "✅ Public App Store Database Created!"
echo "===================================="
echo "Instance: $INSTANCE_NAME"
echo "Public IP: $INSTANCE_IP"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Password: $DB_USER_PASSWORD"
echo ""
echo "Connection string:"
echo "postgresql://$DB_USER:$DB_USER_PASSWORD@$INSTANCE_IP:5432/$DB_NAME"
echo ""
echo "Test connection:"
echo "psql -h $INSTANCE_IP -U $DB_USER -d $DB_NAME"
echo ""
echo "Add to .env:"
echo "APPSTORE_DATABASE_URL=\"postgresql://$DB_USER:$DB_USER_PASSWORD@$INSTANCE_IP:5432/$DB_NAME\""