#!/bin/bash
#
# TestFlight Deployment Script - Complete Backend & iOS Deployment
# This script orchestrates the entire deployment process for TestFlight
#

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="intersend"
REGION="us-central1"
BACKEND_DIR="/Users/ardaerturk/Documents/GitHub/interspace-backend"
IOS_DIR="/Users/ardaerturk/Documents/GitHub/interspace-ios"
ENVIRONMENT="prod"
SERVICE_NAME="interspace-backend-prod"

# Deployment state file
STATE_FILE="/tmp/interspace-deployment-state.txt"
ROLLBACK_INFO="/tmp/interspace-rollback-info.txt"

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

log_step() {
    echo -e "\n${PURPLE}═══ $1 ═══${NC}"
}

save_state() {
    echo "$1" > "$STATE_FILE"
}

get_state() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo "not_started"
    fi
}

prompt_continue() {
    echo ""
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "Deployment cancelled by user"
        exit 1
    fi
}

# Pre-deployment validation
run_pre_deployment_checks() {
    log_step "Running Pre-deployment Checks"
    
    cd "$BACKEND_DIR"
    
    if ./scripts/pre-deployment-check.sh; then
        log_success "Pre-deployment checks passed"
        save_state "pre_checks_complete"
    else
        log_error "Pre-deployment checks failed"
        exit 1
    fi
}

# Backup production database
backup_database() {
    log_step "Backing Up Production Database"
    
    BACKUP_NAME="interspace-prod-backup-$(date +%Y%m%d-%H%M%S)"
    
    log_info "Creating backup: $BACKUP_NAME"
    if gcloud sql backups create \
        --instance=interspace-db-prod \
        --description="Pre-deployment backup for TestFlight" \
        --backup-id="$BACKUP_NAME"; then
        log_success "Database backup created: $BACKUP_NAME"
        echo "backup_id=$BACKUP_NAME" > "$ROLLBACK_INFO"
        save_state "database_backed_up"
    else
        log_error "Database backup failed"
        exit 1
    fi
}

# Build and push Docker image
build_and_push_image() {
    log_step "Building and Pushing Docker Image"
    
    cd "$BACKEND_DIR"
    
    IMAGE_TAG="gcr.io/$PROJECT_ID/interspace-backend:$(git rev-parse --short HEAD)"
    
    log_info "Building Docker image: $IMAGE_TAG"
    if docker build -t "$IMAGE_TAG" -t "gcr.io/$PROJECT_ID/interspace-backend:latest" .; then
        log_success "Docker image built successfully"
    else
        log_error "Docker build failed"
        exit 1
    fi
    
    log_info "Pushing image to Container Registry"
    if docker push "$IMAGE_TAG" && docker push "gcr.io/$PROJECT_ID/interspace-backend:latest"; then
        log_success "Docker image pushed successfully"
        echo "image_tag=$IMAGE_TAG" >> "$ROLLBACK_INFO"
        save_state "image_pushed"
    else
        log_error "Docker push failed"
        exit 1
    fi
}

# Run database migrations
run_migrations() {
    log_step "Running Database Migrations"
    
    log_info "Executing migration job..."
    if gcloud run jobs execute interspace-db-migrate-prod \
        --region=$REGION \
        --wait; then
        log_success "Database migrations completed successfully"
        save_state "migrations_complete"
    else
        log_error "Database migrations failed"
        log_info "Check logs: gcloud run jobs executions logs read --region=$REGION"
        exit 1
    fi
}

# Get current revision for rollback
get_current_revision() {
    gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --format="value(status.traffic[0].revisionName)" 2>/dev/null || echo ""
}

# Deploy to Cloud Run
deploy_backend() {
    log_step "Deploying Backend to Cloud Run"
    
    # Get current revision before deployment
    CURRENT_REVISION=$(get_current_revision)
    if [ -n "$CURRENT_REVISION" ]; then
        echo "previous_revision=$CURRENT_REVISION" >> "$ROLLBACK_INFO"
        log_info "Current revision: $CURRENT_REVISION"
    fi
    
    cd "$BACKEND_DIR"
    
    log_info "Deploying to Cloud Run with traffic control..."
    if gcloud run deploy $SERVICE_NAME \
        --image="gcr.io/$PROJECT_ID/interspace-backend:latest" \
        --region=$REGION \
        --no-traffic; then
        log_success "New revision deployed (no traffic)"
        
        # Get the new revision
        NEW_REVISION=$(gcloud run services describe $SERVICE_NAME \
            --region=$REGION \
            --format="value(status.latestCreatedRevisionName)")
        
        log_info "New revision: $NEW_REVISION"
        echo "new_revision=$NEW_REVISION" >> "$ROLLBACK_INFO"
        
        # Gradually roll out traffic
        log_info "Rolling out traffic: 10%"
        gcloud run services update-traffic $SERVICE_NAME \
            --region=$REGION \
            --to-revisions="$NEW_REVISION=10"
        
        log_info "Waiting 1 minute to monitor errors..."
        sleep 60
        
        # Check health
        HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
            "https://$SERVICE_NAME-$PROJECT_NUMBER.uc.r.appspot.com/health" || echo "000")
        
        if [ "$HEALTH_CHECK" = "200" ]; then
            log_success "Health check passed"
            
            log_info "Increasing traffic to 50%"
            gcloud run services update-traffic $SERVICE_NAME \
                --region=$REGION \
                --to-revisions="$NEW_REVISION=50"
            
            sleep 30
            
            log_info "Rolling out to 100%"
            gcloud run services update-traffic $SERVICE_NAME \
                --region=$REGION \
                --to-revisions="$NEW_REVISION=100"
            
            log_success "Backend deployed successfully"
            save_state "backend_deployed"
        else
            log_error "Health check failed (HTTP $HEALTH_CHECK)"
            rollback_backend
            exit 1
        fi
    else
        log_error "Backend deployment failed"
        exit 1
    fi
}

# Verify backend deployment
verify_backend() {
    log_step "Verifying Backend Deployment"
    
    BASE_URL="https://$SERVICE_NAME-$PROJECT_NUMBER.uc.r.appspot.com"
    
    # Check various endpoints
    ENDPOINTS=(
        "/health"
        "/health/detailed"
        "/api/v2/health"
    )
    
    ALL_GOOD=true
    for ENDPOINT in "${ENDPOINTS[@]}"; do
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ENDPOINT" || echo "000")
        if [ "$STATUS" = "200" ]; then
            log_success "$ENDPOINT: OK ($STATUS)"
        else
            log_error "$ENDPOINT: FAILED ($STATUS)"
            ALL_GOOD=false
        fi
    done
    
    if [ "$ALL_GOOD" = true ]; then
        log_success "All backend endpoints verified"
        save_state "backend_verified"
    else
        log_error "Backend verification failed"
        exit 1
    fi
}

# Update iOS configuration
update_ios_config() {
    log_step "Updating iOS Configuration"
    
    cd "$IOS_DIR"
    
    CONFIG_FILE="Interspace/Supporting/BuildConfiguration.xcconfig"
    PROD_URL="https://$SERVICE_NAME-$PROJECT_NUMBER.uc.r.appspot.com/api/v2"
    
    if [ -f "$CONFIG_FILE" ]; then
        # Backup current config
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
        
        # Update production URL
        if sed -i '' "s|API_BASE_URL_RELEASE = .*|API_BASE_URL_RELEASE = $PROD_URL|" "$CONFIG_FILE"; then
            log_success "Updated production API URL to: $PROD_URL"
        else
            log_error "Failed to update API URL"
            exit 1
        fi
        
        # Verify no placeholder values
        if grep -q "YOUR_.*_HERE" "$CONFIG_FILE"; then
            log_error "Configuration still contains placeholder values"
            log_info "Please update all credentials in $CONFIG_FILE"
            exit 1
        fi
        
        save_state "ios_configured"
    else
        log_error "iOS configuration file not found"
        exit 1
    fi
}

# Build iOS app
build_ios_app() {
    log_step "Building iOS App for TestFlight"
    
    cd "$IOS_DIR"
    
    # Increment build number
    CURRENT_BUILD=$(grep "CURRENT_PROJECT_VERSION" Interspace.xcodeproj/project.pbxproj | head -1 | grep -o '[0-9]*')
    NEW_BUILD=$((CURRENT_BUILD + 1))
    
    log_info "Incrementing build number from $CURRENT_BUILD to $NEW_BUILD"
    sed -i '' "s/CURRENT_PROJECT_VERSION = $CURRENT_BUILD/CURRENT_PROJECT_VERSION = $NEW_BUILD/g" Interspace.xcodeproj/project.pbxproj
    
    log_info "Building iOS app..."
    log_warning "Please complete the following steps in Xcode:"
    echo "1. Open Interspace.xcodeproj in Xcode"
    echo "2. Select 'Any iOS Device' as the destination"
    echo "3. Choose Product > Archive"
    echo "4. Once archived, click 'Distribute App'"
    echo "5. Select 'TestFlight & App Store'"
    echo "6. Follow the upload process"
    echo ""
    echo "The production API URL has been set to: $PROD_URL"
    
    save_state "ios_ready"
}

# Rollback functions
rollback_backend() {
    log_error "Initiating rollback..."
    
    if [ -f "$ROLLBACK_INFO" ]; then
        source "$ROLLBACK_INFO"
        
        if [ -n "${previous_revision:-}" ]; then
            log_info "Rolling back to revision: $previous_revision"
            gcloud run services update-traffic $SERVICE_NAME \
                --region=$REGION \
                --to-revisions="$previous_revision=100"
            log_success "Traffic rolled back"
        fi
    fi
}

# Create deployment summary
create_summary() {
    log_step "Deployment Summary"
    
    SUMMARY_FILE="$BACKEND_DIR/TESTFLIGHT_DEPLOYMENT_$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$SUMMARY_FILE" << EOF
# TestFlight Deployment Summary

**Date:** $(date)
**Environment:** Production

## Backend Deployment

- **Service:** $SERVICE_NAME
- **Region:** $REGION
- **API URL:** https://$SERVICE_NAME-$PROJECT_NUMBER.uc.r.appspot.com/api/v2

## Deployment Checklist

### Backend
- [x] Pre-deployment checks passed
- [x] Database backed up
- [x] Docker image built and pushed
- [x] Database migrations completed
- [x] Backend deployed to Cloud Run
- [x] Health checks verified

### iOS App
- [x] Production API URL updated
- [x] Build number incremented
- [ ] Archive created in Xcode
- [ ] Uploaded to TestFlight
- [ ] Beta review submitted

## Next Steps

1. Complete iOS app upload to TestFlight
2. Submit for beta review
3. Configure test groups
4. Monitor backend logs and metrics
5. Test complete user flow

## Monitoring

- Cloud Console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/metrics?project=$PROJECT_ID
- Logs: https://console.cloud.google.com/logs/query?project=$PROJECT_ID

## Rollback Information

$(cat "$ROLLBACK_INFO" 2>/dev/null || echo "No rollback information available")

EOF

    log_success "Deployment summary created: $SUMMARY_FILE"
}

# Main deployment flow
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "     Interspace TestFlight Deployment Script"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    
    # Check current state
    CURRENT_STATE=$(get_state)
    log_info "Current deployment state: $CURRENT_STATE"
    
    # Resume from last state if needed
    case $CURRENT_STATE in
        "not_started")
            run_pre_deployment_checks
            prompt_continue
            backup_database
            build_and_push_image
            run_migrations
            deploy_backend
            verify_backend
            update_ios_config
            build_ios_app
            ;;
        "pre_checks_complete")
            prompt_continue
            backup_database
            build_and_push_image
            run_migrations
            deploy_backend
            verify_backend
            update_ios_config
            build_ios_app
            ;;
        "database_backed_up")
            build_and_push_image
            run_migrations
            deploy_backend
            verify_backend
            update_ios_config
            build_ios_app
            ;;
        "image_pushed")
            run_migrations
            deploy_backend
            verify_backend
            update_ios_config
            build_ios_app
            ;;
        "migrations_complete")
            deploy_backend
            verify_backend
            update_ios_config
            build_ios_app
            ;;
        "backend_deployed")
            verify_backend
            update_ios_config
            build_ios_app
            ;;
        "backend_verified")
            update_ios_config
            build_ios_app
            ;;
        "ios_configured"|"ios_ready")
            build_ios_app
            ;;
        *)
            log_error "Unknown state: $CURRENT_STATE"
            exit 1
            ;;
    esac
    
    create_summary
    
    # Clean up state file
    rm -f "$STATE_FILE"
    
    log_success "Deployment process completed!"
    echo ""
    echo "Please complete the iOS TestFlight upload in Xcode."
}

# Handle interrupts
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main
main