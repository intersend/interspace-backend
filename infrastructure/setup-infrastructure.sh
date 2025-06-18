#!/bin/bash
set -e

# Interspace Infrastructure Setup Script
# This script sets up the required GCP infrastructure

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ID=""
REGION="us-central1"
ZONE="us-central1-a"

usage() {
    echo "Usage: $0 -p PROJECT_ID [OPTIONS]"
    echo ""
    echo "Required arguments:"
    echo "  -p, --project         Google Cloud Project ID"
    echo ""
    echo "Optional arguments:"
    echo "  -r, --region          GCP region (default: us-central1)"
    echo "  -z, --zone            GCP zone (default: us-central1-a)"
    echo "  -h, --help            Show this help message"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--project)
            PROJECT_ID="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -z|--zone)
            ZONE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

if [[ -z "$PROJECT_ID" ]]; then
    echo -e "${RED}Error: Project ID is required${NC}"
    usage
    exit 1
fi

echo -e "${BLUE}🏗️  Setting up infrastructure for project: $PROJECT_ID${NC}"
echo "Region: $REGION"
echo "Zone: $ZONE"
echo ""

# Set the project
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable vpcaccess.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable servicenetworking.googleapis.com

# Create VPC network for private communication
echo -e "${YELLOW}Creating VPC network...${NC}"
gcloud compute networks create interspace-vpc --subnet-mode=custom --bgp-routing-mode=regional || echo "VPC may already exist"

# Create subnet
echo -e "${YELLOW}Creating subnet...${NC}"
gcloud compute networks subnets create interspace-subnet \
    --network=interspace-vpc \
    --range=10.0.0.0/24 \
    --region=$REGION || echo "Subnet may already exist"

# Create VPC connector for Cloud Run
echo -e "${YELLOW}Creating VPC connector...${NC}"
gcloud compute networks vpc-access connectors create interspace-connector \
    --region=$REGION \
    --subnet=interspace-subnet \
    --subnet-project=$PROJECT_ID \
    --min-instances=2 \
    --max-instances=10 || echo "VPC connector may already exist"

# Create Cloud SQL instances
echo -e "${YELLOW}Creating Cloud SQL instances...${NC}"

# Development database
echo "Creating development database..."
gcloud sql instances create interspace-dev-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=$REGION \
    --network=projects/$PROJECT_ID/global/networks/interspace-vpc \
    --no-assign-ip \
    --deletion-protection || echo "Dev database may already exist"

# Production database
echo "Creating production database..."
gcloud sql instances create interspace-prod-db \
    --database-version=POSTGRES_15 \
    --tier=db-g1-small \
    --region=$REGION \
    --network=projects/$PROJECT_ID/global/networks/interspace-vpc \
    --no-assign-ip \
    --deletion-protection \
    --availability-type=ZONAL \
    --backup-start-time=03:00 \
    --maintenance-window-day=SUN \
    --maintenance-window-hour=04 || echo "Prod database may already exist"

# Create databases
echo -e "${YELLOW}Creating databases...${NC}"
gcloud sql databases create interspace_dev --instance=interspace-dev-db || echo "Dev database may already exist"
gcloud sql databases create interspace_prod --instance=interspace-prod-db || echo "Prod database may already exist"

# Create database users
echo -e "${YELLOW}Creating database users...${NC}"
gcloud sql users create interspace_dev --instance=interspace-dev-db --password=CHANGE_ME_DEV || echo "Dev user may already exist"
gcloud sql users create interspace_prod --instance=interspace-prod-db --password=CHANGE_ME_PROD || echo "Prod user may already exist"

# Create service accounts
echo -e "${YELLOW}Creating service accounts...${NC}"

# Cloud Run service account
gcloud iam service-accounts create interspace-backend-sa \
    --display-name="Interspace Backend Service Account" || echo "Service account may already exist"

# Migration service account
gcloud iam service-accounts create interspace-migration-sa \
    --display-name="Interspace Migration Service Account" || echo "Migration service account may already exist"

# Grant necessary permissions
echo -e "${YELLOW}Granting IAM permissions...${NC}"

# Backend service permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:interspace-backend-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:interspace-backend-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Migration service permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:interspace-migration-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:interspace-migration-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Create initial secrets (with placeholder values)
echo -e "${YELLOW}Creating initial secrets...${NC}"

# Generate random secrets
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_SECRET=$(openssl rand -hex 32)

# Development secrets
echo "$JWT_SECRET" | gcloud secrets create interspace-jwt-secret --data-file=- || echo "Secret may already exist"
echo "$JWT_REFRESH_SECRET" | gcloud secrets create interspace-jwt-refresh-secret --data-file=- || echo "Secret may already exist"
echo "$ENCRYPTION_SECRET" | gcloud secrets create interspace-encryption-secret --data-file=- || echo "Secret may already exist"

# Production secrets (separate from dev)
echo "$(openssl rand -hex 32)" | gcloud secrets create interspace-prod-jwt-secret --data-file=- || echo "Secret may already exist"
echo "$(openssl rand -hex 32)" | gcloud secrets create interspace-prod-jwt-refresh-secret --data-file=- || echo "Secret may already exist"
echo "$(openssl rand -hex 32)" | gcloud secrets create interspace-prod-encryption-secret --data-file=- || echo "Secret may already exist"

# Database URLs
DEV_DB_URL="postgresql://interspace_dev:CHANGE_ME_DEV@/interspace_dev?host=/cloudsql/$PROJECT_ID:$REGION:interspace-dev-db"
PROD_DB_URL="postgresql://interspace_prod:CHANGE_ME_PROD@/interspace_prod?host=/cloudsql/$PROJECT_ID:$REGION:interspace-prod-db"

echo "$DEV_DB_URL" | gcloud secrets create interspace-dev-database-url --data-file=- || echo "Secret may already exist"
echo "$PROD_DB_URL" | gcloud secrets create interspace-prod-database-url --data-file=- || echo "Secret may already exist"

# Placeholder secrets that need to be updated manually
echo "PLACEHOLDER_TOKEN" | gcloud secrets create interspace-silence-admin-token --data-file=- || echo "Secret may already exist"
echo "PLACEHOLDER_TOKEN" | gcloud secrets create interspace-prod-silence-admin-token --data-file=- || echo "Secret may already exist"

echo "PLACEHOLDER_CLIENT_ID" | gcloud secrets create interspace-google-client-id --data-file=- || echo "Secret may already exist"
echo "PLACEHOLDER_CLIENT_ID" | gcloud secrets create interspace-prod-google-client-id --data-file=- || echo "Secret may already exist"

echo "PLACEHOLDER_CLIENT_ID" | gcloud secrets create interspace-apple-client-id --data-file=- || echo "Secret may already exist"
echo "PLACEHOLDER_CLIENT_ID" | gcloud secrets create interspace-prod-apple-client-id --data-file=- || echo "Secret may already exist"

echo "PLACEHOLDER_KEY" | gcloud secrets create interspace-orby-private-key --data-file=- || echo "Secret may already exist"
echo "PLACEHOLDER_KEY" | gcloud secrets create interspace-prod-orby-private-key --data-file=- || echo "Secret may already exist"

echo "PLACEHOLDER_KEY" | gcloud secrets create interspace-orby-public-key --data-file=- || echo "Secret may already exist"
echo "PLACEHOLDER_KEY" | gcloud secrets create interspace-prod-orby-public-key --data-file=- || echo "Secret may already exist"

echo -e "${GREEN}✅ Infrastructure setup completed!${NC}"
echo ""
echo -e "${YELLOW}⚠️  Important next steps:${NC}"
echo "1. Update database user passwords:"
echo "   gcloud sql users set-password interspace_dev --instance=interspace-dev-db --password=NEW_SECURE_PASSWORD"
echo "   gcloud sql users set-password interspace_prod --instance=interspace-prod-db --password=NEW_SECURE_PASSWORD"
echo ""
echo "2. Update database URL secrets with the correct passwords:"
echo "   gcloud secrets versions add interspace-dev-database-url --data-file=NEW_DEV_DATABASE_URL"
echo "   gcloud secrets versions add interspace-prod-database-url --data-file=NEW_PROD_DATABASE_URL"
echo ""
echo "3. Update placeholder secrets with real values:"
echo "   - interspace-silence-admin-token"
echo "   - interspace-google-client-id"
echo "   - interspace-apple-client-id"
echo "   - interspace-orby-private-key"
echo "   - interspace-orby-public-key"
echo "   (And their prod counterparts)"
echo ""
echo -e "${BLUE}Infrastructure is ready for deployment!${NC}"