#!/bin/bash
#
# Local Pre-deployment Validation Script - Interspace Backend
# This script validates local configuration before deployment
#

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
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
                # Remove quotes if present
                VALUE="${VALUE%\"}"
                VALUE="${VALUE#\"}"
                
                if [ -n "$VALUE" ] && [[ ! "$VALUE" =~ ^your- ]] && [[ ! "$VALUE" =~ ^[[:space:]]*$ ]]; then
                    if [ "$VAR" = "SENDGRID_API_KEY" ] || [ "$VAR" = "JWT_SECRET" ] || [ "$VAR" = "JWT_REFRESH_SECRET" ]; then
                        log_success "$VAR is set (hidden for security)"
                    else
                        log_success "$VAR is set: ${VALUE:0:50}..."
                    fi
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
        
        # Check JWT expiration
        JWT_EXPIRES=$(grep "^JWT_EXPIRES_IN=" .env | cut -d'=' -f2- || echo "")
        if [ "$JWT_EXPIRES" = "7d" ]; then
            log_success "JWT expiration is set to 7 days"
        else
            log_warning "JWT expiration is not 7d (current: $JWT_EXPIRES)"
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
        log_warning "node_modules not found. Installing dependencies..."
        npm install --legacy-peer-deps
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
    
    # Check if Docker daemon is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker daemon is not running"
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
            elif [[ "$API_URL" =~ localhost ]]; then
                log_error "Production API URL contains localhost"
            elif [ -n "$API_URL" ]; then
                log_success "Production API URL configured: $API_URL"
            else
                log_error "Production API URL not found"
            fi
        else
            log_error "BuildConfiguration.xcconfig not found"
            log_info "Copy from template: cp BuildConfiguration.xcconfig.template BuildConfiguration.xcconfig"
        fi
        
        # Check Environment.swift
        ENV_FILE="$IOS_DIR/Interspace/Models/Environment.swift"
        if [ -f "$ENV_FILE" ]; then
            if grep -q "ngrok" "$ENV_FILE"; then
                log_error "Environment.swift contains ngrok URL"
            else
                log_success "Environment.swift has no ngrok references"
            fi
        fi
    else
        log_warning "iOS directory not found at expected location"
    fi
}

# Check local files
check_local_files() {
    print_header "Local Files Check"
    
    # Check for test database files
    TEST_DB_COUNT=$(find . -name "test*.db" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$TEST_DB_COUNT" -gt 0 ]; then
        log_warning "Found $TEST_DB_COUNT test database files (should be gitignored)"
    else
        log_success "No test database files in repository"
    fi
    
    # Check for .env in git
    if git ls-files .env --error-unmatch > /dev/null 2>&1; then
        log_error ".env file is tracked by git (should be gitignored)"
    else
        log_success ".env file is not tracked by git"
    fi
    
    # Check for sensitive files
    if [ -f "GoogleService-Info.plist" ]; then
        if git ls-files GoogleService-Info.plist --error-unmatch > /dev/null 2>&1; then
            log_warning "GoogleService-Info.plist is tracked by git"
        fi
    fi
}

# Summary
print_summary() {
    print_header "Local Pre-deployment Check Summary"
    
    echo ""
    echo "Total Errors: $ERRORS"
    echo "Total Warnings: $WARNINGS"
    echo ""
    
    if [ $ERRORS -eq 0 ]; then
        if [ $WARNINGS -eq 0 ]; then
            log_success "All local checks passed! Ready for deployment."
        else
            log_warning "Local configuration ready but review warnings first."
        fi
    else
        log_error "Fix errors before proceeding with deployment."
        exit 1
    fi
    
    echo ""
    echo "Note: This script only checks local configuration."
    echo "Google Cloud resources need to be verified separately."
}

# Main execution
main() {
    echo "Local Pre-deployment Validation for Interspace Backend"
    echo "Environment: $ENVIRONMENT"
    echo "Started at: $(date)"
    
    check_env_vars
    check_code_quality
    check_docker
    check_ios_config
    check_local_files
    
    print_summary
}

# Run main
main