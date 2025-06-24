#!/bin/bash
#
# Pre-deployment Validation Script - Interspace Backend
# This script validates all requirements before deploying to production
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
ENVIRONMENT="${1:-prod}"

# Counters
ERRORS=0
WARNINGS=0

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((ERRORS++))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
    ((WARNINGS++))
}

print_header() {
    echo ""
    echo "========================================="
    echo "$1"
    echo "========================================="
}

# Check Google Cloud Project
check_gcp_project() {
    print_header "Google Cloud Project Configuration"
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
        return 1
    fi
    
    # Check current project
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        log_error "Wrong project. Expected: $PROJECT_ID, Current: $CURRENT_PROJECT"
        log_info "Run: gcloud config set project $PROJECT_ID"
    else
        log_success "Correct project selected: $PROJECT_ID"
    fi
    
    # Check if APIs are enabled
    REQUIRED_APIS=(
        "cloudrun.googleapis.com"
        "cloudsql.googleapis.com"
        "redis.googleapis.com"
        "secretmanager.googleapis.com"
        "cloudbuild.googleapis.com"
        "vpcaccess.googleapis.com"
    )
    
    log_info "Checking required APIs..."
    for API in "${REQUIRED_APIS[@]}"; do
        if gcloud services list --enabled --filter="name:$API" --format="value(name)" | grep -q "$API"; then
            log_success "$API is enabled"
        else
            log_error "$API is NOT enabled"
            log_info "Enable with: gcloud services enable $API"
        fi
    done
    
    # Check billing
    BILLING_ENABLED=$(gcloud beta billing projects describe $PROJECT_ID --format="value(billingEnabled)" 2>/dev/null || echo "false")
    if [ "$BILLING_ENABLED" = "True" ]; then
        log_success "Billing is enabled"
    else
        log_error "Billing is NOT enabled"
    fi
}

# Check OAuth Configuration
check_oauth_config() {
    print_header "OAuth Configuration"
    
    # Check OAuth consent screen
    log_info "Checking OAuth consent screen configuration..."
    log_warning "Manual check required: Verify OAuth consent screen in Google Cloud Console"
    log_info "Required items:"
    log_info "  - App name configured"
    log_info "  - Support email set"
    log_info "  - Developer contact email set"
    log_info "  - Privacy policy URL (if published)"
    log_info "  - Terms of service URL (if published)"
    
    # Check OAuth credentials
    log_info ""
    log_info "OAuth Client IDs to verify:"
    log_info "  - iOS Client: 784862970473-ihme8p5f3psknnorplhero2108rk12sf.apps.googleusercontent.com"
    log_info "  - Web Client: Should match GOOGLE_CLIENT_ID in backend .env"
    log_info "  - Bundle ID restriction: com.interspace.ios"
}

# Check Infrastructure
check_infrastructure() {
    print_header "Infrastructure Components"
    
    # Check VPC Connector
    log_info "Checking VPC connector..."
    if gcloud compute networks vpc-access connectors describe interspace-connector \
        --region=$REGION &> /dev/null; then
        log_success "VPC connector 'interspace-connector' exists"
    else
        log_error "VPC connector 'interspace-connector' not found"
    fi
    
    # Check Cloud SQL
    log_info "Checking Cloud SQL instances..."
    for ENV in dev prod; do
        DB_STATE=$(gcloud sql instances describe interspace-db-$ENV \
            --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
        
        if [ "$DB_STATE" = "RUNNABLE" ]; then
            log_success "Database interspace-db-$ENV is running"
        else
            log_error "Database interspace-db-$ENV is not running (state: $DB_STATE)"
        fi
    done
    
    # Check Redis
    log_info "Checking Redis instances..."
    for ENV in dev prod; do
        REDIS_STATE=$(gcloud redis instances describe interspace-redis-$ENV \
            --region=$REGION --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
        
        if [ "$REDIS_STATE" = "READY" ]; then
            log_success "Redis interspace-redis-$ENV is ready"
        else
            log_error "Redis interspace-redis-$ENV is not ready (state: $REDIS_STATE)"
        fi
    done
}

# Check Secrets
check_secrets() {
    print_header "Secret Manager Configuration"
    
    REQUIRED_SECRETS=(
        "interspace-${ENVIRONMENT}-database-url"
        "interspace-jwt-secret"
        "interspace-jwt-refresh-secret"
        "interspace-encryption-secret"
        "interspace-sendgrid-api-key"
        "interspace-silence-admin-token"
        "interspace-orby-private-key"
        "interspace-orby-public-key"
    )
    
    log_info "Checking required secrets..."
    for SECRET in "${REQUIRED_SECRETS[@]}"; do
        if gcloud secrets describe "$SECRET" &> /dev/null; then
            # Check if secret has a version
            LATEST_VERSION=$(gcloud secrets versions list "$SECRET" --limit=1 --format="value(name)" 2>/dev/null || echo "")
            if [ -n "$LATEST_VERSION" ]; then
                log_success "$SECRET exists and has data"
            else
                log_warning "$SECRET exists but has no versions (empty)"
            fi
        else
            log_error "$SECRET does not exist"
            log_info "Create with: gcloud secrets create $SECRET --data-file=-"
        fi
    done
}

# Check Environment Variables
check_env_vars() {
    print_header "Environment Variables"
    
    if [ -f .env ]; then
        log_info "Checking .env file..."
        
        # Check critical variables
        CRITICAL_VARS=(
            "NODE_ENV"
            "DATABASE_URL"
            "JWT_SECRET"
            "JWT_REFRESH_SECRET"
            "ENCRYPTION_SECRET"
            "EMAIL_SERVICE"
            "SENDGRID_API_KEY"
            "FROM_EMAIL"
            "FRONTEND_URL"
        )
        
        for VAR in "${CRITICAL_VARS[@]}"; do
            if grep -q "^${VAR}=" .env; then
                VALUE=$(grep "^${VAR}=" .env | cut -d'=' -f2-)
                if [ -n "$VALUE" ] && [ "$VALUE" != "your-*" ] && [[ ! "$VALUE" =~ ^[[:space:]]*$ ]]; then
                    log_success "$VAR is set"
                else
                    log_warning "$VAR appears to be a placeholder or empty"
                fi
            else
                log_error "$VAR is not set in .env"
            fi
        done
        
        # Check SendGrid specific config
        EMAIL_SERVICE=$(grep "^EMAIL_SERVICE=" .env | cut -d'=' -f2- || echo "")
        if [ "$EMAIL_SERVICE" = "sendgrid" ]; then
            log_success "Email service is configured for SendGrid"
        else
            log_warning "Email service is not set to 'sendgrid' (current: $EMAIL_SERVICE)"
        fi
    else
        log_error ".env file not found"
    fi
}

# Check Code Quality
check_code_quality() {
    print_header "Code Quality Checks"
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        return 1
    fi
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        log_warning "node_modules not found. Run: npm install"
        return 1
    fi
    
    # Run tests
    log_info "Running test suite..."
    if npm test -- --passWithNoTests > /dev/null 2>&1; then
        log_success "Tests passed"
    else
        log_error "Tests failed"
        log_info "Run 'npm test' to see details"
    fi
    
    # Run type checking
    log_info "Running type checking..."
    if npm run typecheck > /dev/null 2>&1; then
        log_success "Type checking passed"
    else
        log_error "Type checking failed"
        log_info "Run 'npm run typecheck' to see details"
    fi
    
    # Run linting
    log_info "Running linter..."
    if npm run lint > /dev/null 2>&1; then
        log_success "Linting passed"
    else
        log_warning "Linting has warnings"
        log_info "Run 'npm run lint' to see details"
    fi
}

# Check Docker
check_docker() {
    print_header "Docker Configuration"
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        return 1
    fi
    
    # Check if Dockerfile exists
    if [ -f "Dockerfile" ]; then
        log_success "Dockerfile exists"
    else
        log_error "Dockerfile not found"
    fi
    
    # Try to build the image
    log_info "Testing Docker build..."
    if docker build -t interspace-test:latest . --target=production > /dev/null 2>&1; then
        log_success "Docker build successful"
        # Clean up test image
        docker rmi interspace-test:latest > /dev/null 2>&1
    else
        log_error "Docker build failed"
        log_info "Run 'docker build .' to see details"
    fi
}

# Check iOS Configuration
check_ios_config() {
    print_header "iOS App Configuration"
    
    IOS_DIR="/Users/ardaerturk/Documents/GitHub/interspace-ios"
    
    if [ -d "$IOS_DIR" ]; then
        # Check BuildConfiguration.xcconfig
        CONFIG_FILE="$IOS_DIR/Interspace/Supporting/BuildConfiguration.xcconfig"
        if [ -f "$CONFIG_FILE" ]; then
            log_success "BuildConfiguration.xcconfig exists"
            
            # Check for placeholder values
            if grep -q "YOUR_.*_HERE" "$CONFIG_FILE"; then
                log_error "BuildConfiguration.xcconfig contains placeholder values"
            else
                log_success "BuildConfiguration.xcconfig appears configured"
            fi
            
            # Check API URL
            API_URL=$(grep "API_BASE_URL_RELEASE" "$CONFIG_FILE" | cut -d'=' -f2- | tr -d ' ' || echo "")
            if [[ "$API_URL" =~ ngrok ]]; then
                log_error "Production API URL still contains ngrok reference"
            elif [ -n "$API_URL" ]; then
                log_success "Production API URL configured: $API_URL"
            else
                log_error "Production API URL not found"
            fi
        else
            log_error "BuildConfiguration.xcconfig not found"
            log_info "Copy from template: cp BuildConfiguration.xcconfig.template BuildConfiguration.xcconfig"
        fi
    else
        log_warning "iOS directory not found at expected location"
    fi
}

# Summary
print_summary() {
    print_header "Pre-deployment Check Summary"
    
    echo ""
    echo "Total Errors: $ERRORS"
    echo "Total Warnings: $WARNINGS"
    echo ""
    
    if [ $ERRORS -eq 0 ]; then
        if [ $WARNINGS -eq 0 ]; then
            log_success "All checks passed! Ready for deployment."
        else
            log_warning "Deployment possible but review warnings first."
        fi
    else
        log_error "Deployment blocked. Fix errors before proceeding."
        exit 1
    fi
}

# Main execution
main() {
    echo "Pre-deployment Validation for Interspace Backend"
    echo "Environment: $ENVIRONMENT"
    echo "Started at: $(date)"
    
    check_gcp_project
    check_oauth_config
    check_infrastructure
    check_secrets
    check_env_vars
    check_code_quality
    check_docker
    check_ios_config
    
    print_summary
}

# Run main
main