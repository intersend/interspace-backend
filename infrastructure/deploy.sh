#!/bin/bash
set -e

# Interspace Backend Deployment Script
# This script deploys the backend to Google Cloud Run

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
PROJECT_ID=""
REGION="us-central1"
SERVICE_NAME=""
SKIP_BUILD=false
SKIP_MIGRATION=false

# Usage function
usage() {
    echo "Usage: $0 -e ENVIRONMENT -p PROJECT_ID [OPTIONS]"
    echo ""
    echo "Required arguments:"
    echo "  -e, --environment     Environment (dev or prod)"
    echo "  -p, --project         Google Cloud Project ID"
    echo ""
    echo "Optional arguments:"
    echo "  -r, --region          GCP region (default: us-central1)"
    echo "  -s, --service         Service name override"
    echo "  --skip-build          Skip building the container image"
    echo "  --skip-migration      Skip database migration"
    echo "  -h, --help            Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e dev -p my-project-id"
    echo "  $0 -e prod -p my-project-id --skip-migration"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--project)
            PROJECT_ID="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -s|--service)
            SERVICE_NAME="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-migration)
            SKIP_MIGRATION=true
            shift
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

# Validate required arguments
if [[ -z "$ENVIRONMENT" ]]; then
    echo -e "${RED}Error: Environment is required${NC}"
    usage
    exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
    echo -e "${RED}Error: Project ID is required${NC}"
    usage
    exit 1
fi

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo -e "${RED}Error: Environment must be 'dev' or 'prod'${NC}"
    exit 1
fi

# Set service name if not provided
if [[ -z "$SERVICE_NAME" ]]; then
    SERVICE_NAME="interspace-backend-$ENVIRONMENT"
fi

echo -e "${BLUE}🚀 Starting deployment for $ENVIRONMENT environment${NC}"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service Name: $SERVICE_NAME"
echo ""

# Check if gcloud is installed and authenticated
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    exit 1
fi

# Set the project
echo -e "${YELLOW}Setting GCP project...${NC}"
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo -e "${YELLOW}Enabling required GCP APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable vpcaccess.googleapis.com

# Submit Cloud Build
if [[ "$SKIP_BUILD" == false ]]; then
    echo -e "${YELLOW}Starting Cloud Build for $ENVIRONMENT...${NC}"
    
    cd "$PROJECT_ROOT"
    
    # Submit build based on environment
    if [[ "$ENVIRONMENT" == "dev" ]]; then
        gcloud builds submit --config=cloudbuild.dev.yaml --substitutions=_PROJECT_ID="$PROJECT_ID"
    else
        gcloud builds submit --config=cloudbuild.prod.yaml --substitutions=_PROJECT_ID="$PROJECT_ID"
    fi
    
    echo -e "${GREEN}✅ Build completed successfully${NC}"
else
    echo -e "${YELLOW}⏭️  Skipping build step${NC}"
fi

# Run database migration
if [[ "$SKIP_MIGRATION" == false ]]; then
    echo -e "${YELLOW}Running database migration...${NC}"
    
    JOB_NAME="interspace-db-migrate-$ENVIRONMENT"
    
    # Execute migration job
    if gcloud run jobs execute "$JOB_NAME" --region="$REGION" --wait; then
        echo -e "${GREEN}✅ Database migration completed successfully${NC}"
    else
        echo -e "${RED}❌ Database migration failed${NC}"
        echo -e "${YELLOW}Continuing with deployment...${NC}"
    fi
else
    echo -e "${YELLOW}⏭️  Skipping database migration${NC}"
fi

# Get the deployed service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo "Service Details:"
echo "  Name: $SERVICE_NAME"
echo "  URL: $SERVICE_URL"
echo "  Region: $REGION"
echo "  Environment: $ENVIRONMENT"
echo ""

# Health check
echo -e "${YELLOW}Performing health check...${NC}"
if curl -sf "$SERVICE_URL/health" > /dev/null; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${YELLOW}⚠️  Health check failed or service not ready yet${NC}"
fi

echo -e "${BLUE}Deployment process completed!${NC}"