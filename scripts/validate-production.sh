#!/bin/bash

# Production Environment Validation Script
# This script validates that all production requirements are met

set -e

echo "🔍 Validating Production Environment..."
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track validation status
VALIDATION_PASSED=true

# Function to check environment variable
check_env() {
    local var_name=$1
    local var_value=${!var_name}
    local is_secret=$2
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name is not set${NC}"
        VALIDATION_PASSED=false
    else
        if [ "$is_secret" = "true" ]; then
            echo -e "${GREEN}✅ $var_name is set (hidden)${NC}"
        else
            echo -e "${GREEN}✅ $var_name = $var_value${NC}"
        fi
    fi
}

# Function to validate boolean is false
check_false() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [ "$var_value" != "false" ]; then
        echo -e "${RED}❌ $var_name must be false in production (current: $var_value)${NC}"
        VALIDATION_PASSED=false
    else
        echo -e "${GREEN}✅ $var_name = false${NC}"
    fi
}

# Function to validate URL format
check_url() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [[ ! "$var_value" =~ ^https?:// ]]; then
        echo -e "${RED}❌ $var_name is not a valid URL: $var_value${NC}"
        VALIDATION_PASSED=false
    else
        echo -e "${GREEN}✅ $var_name = $var_value${NC}"
    fi
}

# Function to validate CORS origins
check_cors() {
    local cors_value=$CORS_ORIGINS
    
    if [[ "$cors_value" == "*" ]]; then
        echo -e "${RED}❌ CORS_ORIGINS cannot be wildcard (*) in production${NC}"
        VALIDATION_PASSED=false
    elif [[ "$cors_value" =~ localhost ]]; then
        echo -e "${YELLOW}⚠️  CORS_ORIGINS contains localhost: $cors_value${NC}"
    else
        echo -e "${GREEN}✅ CORS_ORIGINS = $cors_value${NC}"
    fi
}

echo ""
echo "1. Checking Critical Environment Variables"
echo "------------------------------------------"
check_env "NODE_ENV"
check_env "PORT"
check_env "DATABASE_URL" true
check_env "JWT_SECRET" true
check_env "JWT_REFRESH_SECRET" true
check_env "ENCRYPTION_SECRET" true

echo ""
echo "2. Checking Security Configuration"
echo "------------------------------------------"
check_false "BYPASS_LOGIN"
check_false "DISABLE_MPC"
check_cors

echo ""
echo "3. Checking Service URLs"
echo "------------------------------------------"
check_url "SILENCE_NODE_URL"
check_url "DUO_NODE_URL"
check_url "FRONTEND_URL"
check_url "ORBY_PRIVATE_INSTANCE_URL"

echo ""
echo "4. Checking Redis Configuration"
echo "------------------------------------------"
check_env "REDIS_ENABLED"
if [ "$REDIS_ENABLED" = "true" ]; then
    check_env "REDIS_URL" true
else
    echo -e "${YELLOW}⚠️  Redis is disabled - distributed features won't work${NC}"
fi

echo ""
echo "5. Checking Email Configuration"
echo "------------------------------------------"
check_env "EMAIL_SERVICE"
check_env "EMAIL_FROM"
check_env "SENDGRID_API_KEY" true

echo ""
echo "6. Checking Rate Limiting"
echo "------------------------------------------"
check_env "RATE_LIMIT_WINDOW_MS"
check_env "RATE_LIMIT_MAX_REQUESTS"

# Validate rate limits are reasonable
if [ "$RATE_LIMIT_MAX_REQUESTS" -gt "1000" ]; then
    echo -e "${YELLOW}⚠️  Rate limit seems high for production: $RATE_LIMIT_MAX_REQUESTS${NC}"
fi

echo ""
echo "7. Checking Monitoring Configuration"
echo "------------------------------------------"
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    echo -e "${GREEN}✅ Slack webhook configured${NC}"
else
    echo -e "${YELLOW}⚠️  No Slack webhook configured${NC}"
fi

if [ -n "$SECURITY_ALERT_EMAIL" ]; then
    echo -e "${GREEN}✅ Security alert email: $SECURITY_ALERT_EMAIL${NC}"
else
    echo -e "${YELLOW}⚠️  No security alert email configured${NC}"
fi

echo ""
echo "8. Validating JWT Configuration"
echo "------------------------------------------"
if [ "$JWT_EXPIRES_IN" != "15m" ]; then
    echo -e "${YELLOW}⚠️  JWT_EXPIRES_IN should be 15m for security (current: $JWT_EXPIRES_IN)${NC}"
fi

if [ "$JWT_REFRESH_EXPIRES_IN" != "7d" ]; then
    echo -e "${YELLOW}⚠️  JWT_REFRESH_EXPIRES_IN should be 7d (current: $JWT_REFRESH_EXPIRES_IN)${NC}"
fi

echo ""
echo "9. Checking Encryption Secret"
echo "------------------------------------------"
# Check if encryption secret is 64 characters (32 bytes in hex)
if [ ${#ENCRYPTION_SECRET} -ne 64 ]; then
    echo -e "${RED}❌ ENCRYPTION_SECRET must be 64 hex characters (32 bytes)${NC}"
    VALIDATION_PASSED=false
else
    echo -e "${GREEN}✅ ENCRYPTION_SECRET length is correct${NC}"
fi

echo ""
echo "10. Database Connection Test"
echo "------------------------------------------"
if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
        echo -e "${GREEN}✅ Database connection successful${NC}"
    else
        echo -e "${RED}❌ Database connection failed${NC}"
        VALIDATION_PASSED=false
    fi
else
    echo -e "${YELLOW}⚠️  psql not installed, skipping database test${NC}"
fi

echo ""
echo "======================================="
if [ "$VALIDATION_PASSED" = true ]; then
    echo -e "${GREEN}✅ PRODUCTION VALIDATION PASSED${NC}"
    echo "Your environment is ready for production deployment!"
    exit 0
else
    echo -e "${RED}❌ PRODUCTION VALIDATION FAILED${NC}"
    echo "Please fix the issues above before deploying to production."
    exit 1
fi