#!/bin/bash
set -e

# Deploy Silence Labs Duo Server (sigpair) to Google Cloud Run

PROJECT_ID="intersend"
REGION="us-central1"
SERVICE_NAME="sigpair"
ENVIRONMENT="${1:-dev}"  # Default to dev if not specified

echo "🚀 Deploying Silence Labs Duo Server (${SERVICE_NAME}-${ENVIRONMENT})..."

# Check if Cloud SQL instance exists for sigpair
SIGPAIR_DB_INSTANCE="${SERVICE_NAME}-db-${ENVIRONMENT}"
SIGPAIR_DB_EXISTS=$(gcloud sql instances list --filter="name:${SIGPAIR_DB_INSTANCE}" --format="value(name)" || echo "")

if [ -z "$SIGPAIR_DB_EXISTS" ]; then
    echo "📦 Creating Cloud SQL instance for sigpair..."
    gcloud sql instances create ${SIGPAIR_DB_INSTANCE} \
        --database-version=POSTGRES_14 \
        --tier=db-f1-micro \
        --region=${REGION} \
        --network=projects/${PROJECT_ID}/global/networks/interspace-vpc \
        --no-assign-ip \
        --deletion-protection
    
    # Wait for instance to be ready
    echo "⏳ Waiting for database instance to be ready..."
    sleep 30
    
    # Create database and user
    gcloud sql databases create sigpair --instance=${SIGPAIR_DB_INSTANCE}
    gcloud sql users create sigpair --instance=${SIGPAIR_DB_INSTANCE} --password=sigpair-${ENVIRONMENT}-$(openssl rand -hex 16)
else
    echo "✅ Cloud SQL instance ${SIGPAIR_DB_INSTANCE} already exists"
fi

# Get the private IP of the Cloud SQL instance
DB_PRIVATE_IP=$(gcloud sql instances describe ${SIGPAIR_DB_INSTANCE} \
    --format="value(ipAddresses[0].ipAddress)" 2>/dev/null || echo "")

if [ -z "$DB_PRIVATE_IP" ]; then
    echo "❌ Failed to get Cloud SQL private IP"
    exit 1
fi

echo "🔗 Cloud SQL private IP: ${DB_PRIVATE_IP}"

# Deploy sigpair service
echo "🚀 Deploying sigpair service..."
gcloud run deploy ${SERVICE_NAME}-${ENVIRONMENT} \
    --image=ghcr.io/silence-laboratories/duo-server:v2-latest \
    --region=${REGION} \
    --platform=managed \
    --no-allow-unauthenticated \
    --service-account=interspace-duo-${ENVIRONMENT}@${PROJECT_ID}.iam.gserviceaccount.com \
    --set-env-vars="PGHOST=${DB_PRIVATE_IP}" \
    --set-env-vars="PGUSER=sigpair" \
    --set-env-vars="PGDATABASE=sigpair" \
    --set-env-vars="PGPASSWORD=sigpair-${ENVIRONMENT}-password" \
    --vpc-connector=projects/${PROJECT_ID}/locations/${REGION}/connectors/interspace-connector \
    --vpc-egress=all-traffic \
    --memory=512Mi \
    --cpu=1 \
    --timeout=60 \
    --concurrency=100 \
    --min-instances=0 \
    --max-instances=10 \
    --labels="environment=${ENVIRONMENT},team=backend,service=sigpair"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME}-${ENVIRONMENT} \
    --platform=managed \
    --region=${REGION} \
    --format="value(status.url)")

echo "✅ Sigpair deployed successfully!"
echo "🔗 Service URL: ${SERVICE_URL}"

# Now update duo-node to use the correct sigpair URL
echo "🔄 Updating interspace-duo-node-${ENVIRONMENT} to use sigpair..."
gcloud run services update interspace-duo-node-${ENVIRONMENT} \
    --region=${REGION} \
    --update-env-vars="DUO_SERVER_URL=${SERVICE_URL}"

echo "✅ All done! Sigpair is deployed and duo-node is updated."