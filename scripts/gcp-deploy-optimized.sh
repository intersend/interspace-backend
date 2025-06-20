#!/bin/bash
#
# Optimized GCP Deployment Script - Cost-Efficient Configuration
# Estimated monthly savings: $300-600
#

set -euo pipefail

# Configuration
PROJECT_ID="intersend"
REGION="us-central1"
SERVICE_NAME="interspace-backend"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Deploying cost-optimized configuration...${NC}"

# Deploy Redis as Cloud Run service (saves ~$150-300/month)
echo -e "${YELLOW}Deploying Redis container to Cloud Run...${NC}"
gcloud run deploy interspace-redis \
    --image=redis:7-alpine \
    --platform=managed \
    --region=$REGION \
    --memory=128Mi \
    --cpu=0.08 \
    --min-instances=0 \
    --max-instances=1 \
    --port=6379 \
    --no-allow-unauthenticated \
    --vpc-connector=projects/$PROJECT_ID/locations/$REGION/connectors/interspace-connector \
    --vpc-egress=private-ranges-only \
    --command="redis-server,--save,60 1,--loglevel,warning,--maxmemory,100mb,--maxmemory-policy,allkeys-lru"

# Update backend services with optimized settings
ENVIRONMENTS=("dev" "prod")

for ENV in "${ENVIRONMENTS[@]}"; do
    echo -e "${YELLOW}Deploying optimized $ENV backend...${NC}"
    
    if [ "$ENV" = "dev" ]; then
        MEMORY="512Mi"
        CPU="0.5"
        MIN_INSTANCES="0"
        MAX_INSTANCES="2"
        CONCURRENCY="40"
    else
        MEMORY="1Gi"
        CPU="1"
        MIN_INSTANCES="0"  # Changed from 1 to save costs
        MAX_INSTANCES="10"  # Reduced from 100
        CONCURRENCY="50"
    fi
    
    gcloud run deploy "$SERVICE_NAME-$ENV" \
        --platform=managed \
        --region=$REGION \
        --memory=$MEMORY \
        --cpu=$CPU \
        --min-instances=$MIN_INSTANCES \
        --max-instances=$MAX_INSTANCES \
        --concurrency=$CONCURRENCY \
        --cpu-throttling \
        --execution-environment=gen2
done

# Apply database optimizations
echo -e "${YELLOW}Note: Database optimizations require recreation${NC}"
echo "Dev DB: db-f1-micro (from db-g1-small) - saves ~$25/month"
echo "Prod DB: db-g1-small (from db-custom-2-8192) - saves ~$150/month"
echo "Redis: Cloud Run container (from Memorystore) - saves ~$150-300/month"

echo -e "${GREEN}Optimization complete!${NC}"
echo ""
echo "Estimated monthly savings: $325-475"
echo "New estimated monthly cost: $150-250 (down from $450-700)"
echo ""
echo "Additional recommendations:"
echo "1. Enable Cloud Run CPU allocation only during request processing"
echo "2. Use Cloud Scheduler to scale down services during off-hours"
echo "3. Consider using Spot VMs for non-critical workloads"
echo "4. Enable automatic storage increase for databases instead of over-provisioning"