#!/bin/bash
#
# Emergency Rollback Script - Interspace Backend
# Use this script to quickly rollback to a previous version
#

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="intersend"
REGION="us-central1"
SERVICE_NAME="interspace-backend-prod"

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

# Get current traffic allocation
get_current_traffic() {
    log_info "Current traffic allocation:"
    gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --format="table(status.traffic.revisionName,status.traffic.percent)"
}

# List recent revisions
list_revisions() {
    log_info "Recent revisions (newest first):"
    gcloud run revisions list \
        --service=$SERVICE_NAME \
        --region=$REGION \
        --format="table(metadata.name,metadata.creationTimestamp,status.conditions[0].status)" \
        --limit=10
}

# Rollback to specific revision
rollback_to_revision() {
    local REVISION=$1
    
    log_warning "Rolling back to revision: $REVISION"
    
    # Confirm action
    read -p "Are you sure you want to rollback? (yes/no) " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Rollback cancelled"
        exit 0
    fi
    
    # Execute rollback
    if gcloud run services update-traffic $SERVICE_NAME \
        --region=$REGION \
        --to-revisions="$REVISION=100"; then
        log_success "Traffic rolled back to $REVISION"
        
        # Verify health
        sleep 5
        verify_health
    else
        log_error "Rollback failed"
        exit 1
    fi
}

# Rollback to previous revision
rollback_to_previous() {
    # Get the second most recent revision
    PREVIOUS_REVISION=$(gcloud run revisions list \
        --service=$SERVICE_NAME \
        --region=$REGION \
        --format="value(metadata.name)" \
        --limit=2 | tail -1)
    
    if [ -z "$PREVIOUS_REVISION" ]; then
        log_error "No previous revision found"
        exit 1
    fi
    
    rollback_to_revision "$PREVIOUS_REVISION"
}

# Verify service health
verify_health() {
    log_info "Verifying service health..."
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --format="value(status.url)")
    
    if [ -z "$SERVICE_URL" ]; then
        log_error "Could not determine service URL"
        return 1
    fi
    
    # Check health endpoint
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || echo "000")
    
    if [ "$HEALTH_STATUS" = "200" ]; then
        log_success "Health check passed (HTTP $HEALTH_STATUS)"
    else
        log_error "Health check failed (HTTP $HEALTH_STATUS)"
    fi
}

# Show rollback options
show_menu() {
    echo ""
    echo "Emergency Rollback Options:"
    echo "1. View current traffic allocation"
    echo "2. List recent revisions"
    echo "3. Rollback to previous revision"
    echo "4. Rollback to specific revision"
    echo "5. Verify service health"
    echo "6. Exit"
    echo ""
}

# Main menu loop
main() {
    echo "═══════════════════════════════════════════════════════"
    echo "     Interspace Emergency Rollback Script"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    log_warning "This script should only be used in emergency situations"
    echo ""
    
    while true; do
        show_menu
        read -p "Select an option (1-6): " choice
        
        case $choice in
            1)
                get_current_traffic
                ;;
            2)
                list_revisions
                ;;
            3)
                rollback_to_previous
                ;;
            4)
                list_revisions
                echo ""
                read -p "Enter revision name to rollback to: " revision
                if [ -n "$revision" ]; then
                    rollback_to_revision "$revision"
                else
                    log_error "No revision specified"
                fi
                ;;
            5)
                verify_health
                ;;
            6)
                log_info "Exiting"
                exit 0
                ;;
            *)
                log_error "Invalid option"
                ;;
        esac
        
        echo ""
        read -p "Press Enter to continue..."
    done
}

# Run main
main