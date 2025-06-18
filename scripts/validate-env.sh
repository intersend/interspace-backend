#!/bin/bash
set -e

# Validate environment variables

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Validating environment variables...${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Function to check required variable
check_required() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name: Missing (required)${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ $var_name: Set${NC}"
    fi
}

# Function to check optional variable
check_optional() {
    local var_name=$1
    local var_value=${!var_name}
    local default_msg=$2
    
    if [ -z "$var_value" ]; then
        echo -e "${YELLOW}⚠️  $var_name: Not set (optional) - $default_msg${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✅ $var_name: Set${NC}"
    fi
}

# Function to validate URL format
check_url() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name: Missing (required)${NC}"
        ERRORS=$((ERRORS + 1))
    elif [[ ! "$var_value" =~ ^https?:// ]]; then
        echo -e "${YELLOW}⚠️  $var_name: Invalid URL format (should start with http:// or https://)${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✅ $var_name: Valid URL${NC}"
    fi
}

# Function to validate database URL
check_database_url() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name: Missing (required)${NC}"
        ERRORS=$((ERRORS + 1))
    elif [[ ! "$var_value" =~ ^postgresql:// ]]; then
        echo -e "${RED}❌ $var_name: Invalid format (should start with postgresql://)${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ $var_name: Valid PostgreSQL URL${NC}"
    fi
}

# Function to validate boolean
check_boolean() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name: Missing (required)${NC}"
        ERRORS=$((ERRORS + 1))
    elif [[ "$var_value" != "true" && "$var_value" != "false" ]]; then
        echo -e "${RED}❌ $var_name: Invalid value '$var_value' (must be 'true' or 'false')${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ $var_name: Valid boolean${NC}"
    fi
}

# Function to validate number
check_number() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name: Missing (required)${NC}"
        ERRORS=$((ERRORS + 1))
    elif ! [[ "$var_value" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}❌ $var_name: Invalid value '$var_value' (must be a number)${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ $var_name: Valid number${NC}"
    fi
}

echo "Core Configuration:"
echo "------------------"
check_required "NODE_ENV"
check_number "PORT"
check_required "API_VERSION"
echo ""

echo "Database Configuration:"
echo "----------------------"
check_database_url "DATABASE_URL"
echo ""

echo "JWT Configuration:"
echo "-----------------"
check_required "JWT_SECRET"
check_required "JWT_REFRESH_SECRET"
check_required "JWT_EXPIRES_IN"
check_required "JWT_REFRESH_EXPIRES_IN"
check_required "ENCRYPTION_SECRET"

# Check JWT secret strength
if [ -n "$JWT_SECRET" ] && [ ${#JWT_SECRET} -lt 32 ]; then
    echo -e "${YELLOW}⚠️  JWT_SECRET: Weak (should be at least 32 characters)${NC}"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

echo "MPC Configuration:"
echo "-----------------"
check_boolean "DISABLE_MPC"
check_boolean "BYPASS_LOGIN"

if [ "$DISABLE_MPC" != "true" ]; then
    check_required "SILENCE_ADMIN_TOKEN"
    check_url "SILENCE_NODE_URL"
    check_url "DUO_NODE_URL"
    check_url "DUO_NODE_AUDIENCE_URL"
else
    echo -e "${BLUE}ℹ️  MPC is disabled - skipping MPC service checks${NC}"
fi
echo ""

echo "Social Auth Configuration:"
echo "-------------------------"
check_optional "GOOGLE_CLIENT_ID" "Required for Google login"
check_optional "APPLE_CLIENT_ID" "Required for Apple login"
echo ""

echo "Orby Configuration:"
echo "------------------"
check_required "ORBY_INSTANCE_PRIVATE_API_KEY"
check_required "ORBY_INSTANCE_PUBLIC_API_KEY"
check_required "ORBY_APP_NAME"
check_url "ORBY_PRIVATE_INSTANCE_URL"
echo ""

echo "Frontend Configuration:"
echo "----------------------"
check_url "FRONTEND_URL"
echo ""

echo "Chain Configuration:"
echo "-------------------"
check_number "DEFAULT_CHAIN_ID"
check_required "SUPPORTED_CHAINS"

# Validate chain format
if [ -n "$SUPPORTED_CHAINS" ]; then
    if [[ ! "$SUPPORTED_CHAINS" =~ ^[0-9,]+$ ]]; then
        echo -e "${RED}❌ SUPPORTED_CHAINS: Invalid format (should be comma-separated numbers)${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi
echo ""

echo "Security Configuration:"
echo "----------------------"
check_required "CORS_ORIGINS"
check_number "RATE_LIMIT_WINDOW_MS"
check_number "RATE_LIMIT_MAX_REQUESTS"

# Security warnings
if [ "$NODE_ENV" == "production" ]; then
    if [ "$BYPASS_LOGIN" == "true" ]; then
        echo -e "${RED}❌ SECURITY: BYPASS_LOGIN must be false in production!${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    
    if [[ "$CORS_ORIGINS" == "*" ]]; then
        echo -e "${RED}❌ SECURITY: CORS_ORIGINS cannot be '*' in production!${NC}"
        ERRORS=$((ERRORS + 1))
    fi
fi
echo ""

# Summary
echo "================================"
echo -e "Validation Results:"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All environment variables are valid!${NC}"
    exit 0
else
    if [ $ERRORS -gt 0 ]; then
        echo -e "${RED}❌ Found $ERRORS errors${NC}"
    fi
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Found $WARNINGS warnings${NC}"
    fi
    
    if [ $ERRORS -gt 0 ]; then
        echo ""
        echo -e "${RED}Please fix the errors before proceeding.${NC}"
        exit 1
    else
        echo ""
        echo -e "${YELLOW}Warnings found but you can proceed.${NC}"
        exit 0
    fi
fi