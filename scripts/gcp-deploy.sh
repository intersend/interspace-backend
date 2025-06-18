#!/bin/bash
#
# GCP Deployment Script - Interspace Backend
# Version: 1.0.0
# Usage: ./gcp-deploy.sh [dev|prod]
#

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="intersend"
PROJECT_NUMBER="784862970473"
REGION="us-central1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

usage() {
    echo "Usage: $0 [dev|prod]"
    echo "Deploy Interspace Backend to Google Cloud Run"
    echo ""
    echo "Options:"
    echo "  dev   Deploy to development environment"
    echo "  prod  Deploy to production environment"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install Google Cloud SDK."
        exit 1
    fi
    
    # Check if logged in
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_error "Not logged in to gcloud. Please run: gcloud auth login"
        exit 1
    fi
    
    # Check project
    CURRENT_PROJECT=$(gcloud config get-value project)
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        log_error "Wrong project. Expected: $PROJECT_ID, Current: $CURRENT_PROJECT"
        log_info "Run: gcloud config set project $PROJECT_ID"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install Node.js and npm."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run unit tests
    if ! npm test; then
        log_error "Tests failed. Fix the issues before deploying."
        exit 1
    fi
    
    # Run type checking
    if ! npm run typecheck; then
        log_error "Type checking failed. Fix the issues before deploying."
        exit 1
    fi
    
    # Run linting
    if ! npm run lint; then
        log_error "Linting failed. Fix the issues before deploying."
        exit 1
    fi
    
    log_success "All tests passed"
}

# Validate environment
validate_environment() {
    local ENV=$1
    log_info "Validating $ENV environment..."
    
    # Check VPC connector
    if ! gcloud compute networks vpc-access connectors describe interspace-connector \
         --region=$REGION &> /dev/null; then
        log_error "VPC connector not found"
        exit 1
    fi
    
    # Check database
    DB_STATE=$(gcloud sql instances describe interspace-db-$ENV \
        --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$DB_STATE" != "RUNNABLE" ]; then
        log_error "Database interspace-db-$ENV is not running (state: $DB_STATE)"
        exit 1
    fi
    
    # Check Redis
    REDIS_STATE=$(gcloud redis instances describe interspace-redis-$ENV \
        --region=$REGION --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
    
    if [ "$REDIS_STATE" != "READY" ]; then
        log_error "Redis interspace-redis-$ENV is not ready (state: $REDIS_STATE)"
        exit 1
    fi
    
    # Check secrets
    REQUIRED_SECRETS=(
        "interspace-$ENV-database-url"
        "interspace-jwt-secret"
        "interspace-jwt-refresh-secret"
        "interspace-encryption-secret"
    )
    
    for SECRET in "${REQUIRED_SECRETS[@]}"; do
        if ! gcloud secrets describe "$SECRET" &> /dev/null; then
            log_error "Secret $SECRET not found"
            exit 1
        fi
    done
    
    log_success "Environment validation passed"
}

# Deploy to development
deploy_dev() {
    log_info "Deploying to DEVELOPMENT environment..."
    
    # Run pre-deployment checks
    validate_environment "dev"
    
    # Deploy using Cloud Build
    log_info "Starting Cloud Build..."
    if ! gcloud builds submit --config=cloudbuild.dev.yaml; then
        log_error "Cloud Build failed"
        exit 1
    fi
    
    # Wait for service to be ready
    log_info "Waiting for service to be ready..."
    if ! gcloud run services wait interspace-backend-dev --region=$REGION; then
        log_error "Service deployment failed"
        exit 1
    fi
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe interspace-backend-dev \
        --region=$REGION --format="value(status.url)")
    
    # Test health endpoint
    log_info "Testing health endpoint..."
    if ! curl -f "$SERVICE_URL/health" > /dev/null 2>&1; then
        log_error "Health check failed"
        exit 1
    fi
    
    log_success "Deployment to DEVELOPMENT completed successfully!"
    log_info "Service URL: $SERVICE_URL"
}

# Deploy to production
deploy_prod() {
    log_info "Deploying to PRODUCTION environment..."
    
    # Extra confirmation for production
    echo -e "${YELLOW}⚠️  WARNING: You are about to deploy to PRODUCTION!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        log_info "Deployment cancelled"
        exit 0
    fi
    
    # Check if on main branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        log_error "You must be on the main branch to deploy to production"
        log_info "Current branch: $CURRENT_BRANCH"
        exit 1
    fi
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        log_error "You have uncommitted changes. Commit or stash them before deploying."
        exit 1
    fi
    
    # Run pre-deployment checks
    validate_environment "prod"
    
    # Create a deployment tag
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    TAG="deploy-prod-$TIMESTAMP"
    
    log_info "Creating deployment tag: $TAG"
    git tag -a "$TAG" -m "Production deployment $TIMESTAMP"
    git push origin "$TAG"
    
    # Deploy using Cloud Build
    log_info "Starting Cloud Build..."
    if ! gcloud builds submit --config=cloudbuild.prod.yaml; then
        log_error "Cloud Build failed"
        exit 1
    fi
    
    # Monitor the deployment
    log_info "Monitoring deployment progress..."
    
    # Get the latest revision
    LATEST_REVISION=$(gcloud run revisions list \
        --service=interspace-backend-prod \
        --region=$REGION \
        --limit=1 \
        --format="value(name)")
    
    log_info "New revision: $LATEST_REVISION"
    
    # Monitor traffic migration
    log_info "Traffic migration in progress (0% → 10% → 50% → 100%)..."
    
    # Wait for service to be ready
    if ! gcloud run services wait interspace-backend-prod --region=$REGION; then
        log_error "Service deployment failed"
        exit 1
    fi
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe interspace-backend-prod \
        --region=$REGION --format="value(status.url)")
    
    # Test health endpoint
    log_info "Testing health endpoint..."
    if ! curl -f "$SERVICE_URL/health" > /dev/null 2>&1; then
        log_error "Health check failed"
        exit 1
    fi
    
    log_success "Deployment to PRODUCTION completed successfully!"
    log_info "Service URL: $SERVICE_URL"
    log_info "Deployment tag: $TAG"
}

# Post-deployment verification
post_deployment_verification() {
    local ENV=$1
    log_info "Running post-deployment verification for $ENV..."
    
    # Check service status
    SERVICE_STATUS=$(gcloud run services describe interspace-backend-$ENV \
        --region=$REGION \
        --format="value(status.conditions[0].status)")
    
    if [ "$SERVICE_STATUS" != "True" ]; then
        log_error "Service is not healthy"
        exit 1
    fi
    
    # Check recent logs for errors
    log_info "Checking recent logs..."
    ERROR_COUNT=$(gcloud run logs read \
        --service=interspace-backend-$ENV \
        --region=$REGION \
        --limit=100 \
        --format="value(textPayload)" | grep -c "ERROR" || true)
    
    if [ "$ERROR_COUNT" -gt 10 ]; then
        log_warning "Found $ERROR_COUNT errors in recent logs"
    fi
    
    # Check metrics
    log_info "Service metrics will be available in Cloud Console:"
    echo "https://console.cloud.google.com/run/detail/$REGION/interspace-backend-$ENV/metrics"
    
    log_success "Post-deployment verification completed"
}

# Rollback function
rollback() {
    local ENV=$1
    log_warning "Initiating rollback for $ENV environment..."
    
    # Get previous revision
    PREVIOUS_REVISION=$(gcloud run revisions list \
        --service=interspace-backend-$ENV \
        --region=$REGION \
        --limit=2 \
        --format="value(name)" | tail -1)
    
    if [ -z "$PREVIOUS_REVISION" ]; then
        log_error "No previous revision found"
        exit 1
    fi
    
    log_info "Rolling back to revision: $PREVIOUS_REVISION"
    
    # Update traffic to previous revision
    if gcloud run services update-traffic interspace-backend-$ENV \
        --region=$REGION \
        --to-revisions="$PREVIOUS_REVISION=100"; then
        log_success "Rollback completed successfully"
    else
        log_error "Rollback failed"
        exit 1
    fi
}

# Main execution
main() {
    if [ $# -ne 1 ]; then
        usage
    fi
    
    ENV=$1
    
    case $ENV in
        dev|development)
            ENV="dev"
            ;;
        prod|production)
            ENV="prod"
            ;;
        *)
            log_error "Invalid environment: $ENV"
            usage
            ;;
    esac
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    # Print deployment banner
    echo "=================================================="
    echo "   Interspace Backend Deployment"
    echo "   Environment: ${ENV^^}"
    echo "   Project: $PROJECT_ID"
    echo "   Region: $REGION"
    echo "=================================================="
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Run tests
    run_tests
    
    # Deploy based on environment
    if [ "$ENV" = "dev" ]; then
        deploy_dev
    else
        deploy_prod
    fi
    
    # Post-deployment verification
    post_deployment_verification "$ENV"
    
    echo ""
    echo "=================================================="
    echo "   Deployment completed successfully! 🎉"
    echo "=================================================="
}

# Run main function
main "$@"