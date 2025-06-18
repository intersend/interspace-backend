#!/bin/bash
set -e

# Generate secure secrets for local development

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Generating secure secrets for local development...${NC}"
echo ""

# Function to generate a random secret
generate_secret() {
    openssl rand -hex 32
}

# Function to generate a random 32-byte hex key
generate_hex_key() {
    openssl rand -hex 16
}

# Function to update or add an environment variable
update_env_var() {
    local key=$1
    local value=$2
    local file=$3
    
    if grep -q "^$key=" "$file"; then
        # Update existing variable (works on both macOS and Linux)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^$key=.*|$key=$value|" "$file"
        else
            sed -i "s|^$key=.*|$key=$value|" "$file"
        fi
    else
        # Add new variable
        echo "$key=$value" >> "$file"
    fi
}

# Backup existing .env file
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}Backed up existing .env file${NC}"
fi

# Generate JWT secrets
echo "Generating JWT secrets..."
JWT_SECRET=$(generate_secret)
JWT_REFRESH_SECRET=$(generate_secret)
update_env_var "JWT_SECRET" "$JWT_SECRET" "$ENV_FILE"
update_env_var "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET" "$ENV_FILE"
echo -e "${GREEN}✅ JWT secrets generated${NC}"

# Generate encryption secret
echo "Generating encryption secret..."
ENCRYPTION_SECRET=$(generate_hex_key)
update_env_var "ENCRYPTION_SECRET" "$ENCRYPTION_SECRET" "$ENV_FILE"
echo -e "${GREEN}✅ Encryption secret generated${NC}"

# Set default values for local development
echo ""
echo "Setting local development defaults..."

# Database configuration
update_env_var "DATABASE_URL" "postgresql://postgres:postgres@localhost:5432/interspace" "$ENV_FILE"

# Server configuration
update_env_var "NODE_ENV" "development" "$ENV_FILE"
update_env_var "PORT" "3000" "$ENV_FILE"
update_env_var "API_VERSION" "v1" "$ENV_FILE"

# JWT expiration
update_env_var "JWT_EXPIRES_IN" "7d" "$ENV_FILE"
update_env_var "JWT_REFRESH_EXPIRES_IN" "30d" "$ENV_FILE"

# MPC Configuration for local testing
update_env_var "DISABLE_MPC" "true" "$ENV_FILE"  # Disable MPC for local testing by default
update_env_var "BYPASS_LOGIN" "false" "$ENV_FILE"  # Keep login enabled for security
update_env_var "SILENCE_ADMIN_TOKEN" "local-test-token-$(generate_hex_key)" "$ENV_FILE"
update_env_var "SILENCE_NODE_URL" "http://localhost:8080" "$ENV_FILE"
update_env_var "DUO_NODE_URL" "http://localhost:3001" "$ENV_FILE"
update_env_var "DUO_NODE_AUDIENCE_URL" "http://localhost:3001" "$ENV_FILE"

# Social auth placeholders
update_env_var "GOOGLE_CLIENT_ID" "your-google-client-id-here" "$ENV_FILE"
update_env_var "APPLE_CLIENT_ID" "com.interspace.app.local" "$ENV_FILE"

# Orby configuration placeholders
update_env_var "ORBY_INSTANCE_PRIVATE_API_KEY" "local-orby-private-$(generate_hex_key)" "$ENV_FILE"
update_env_var "ORBY_INSTANCE_PUBLIC_API_KEY" "local-orby-public-$(generate_hex_key)" "$ENV_FILE"
update_env_var "ORBY_APP_NAME" "interspace-local" "$ENV_FILE"
update_env_var "ORBY_PRIVATE_INSTANCE_URL" "https://orby.local.example.com" "$ENV_FILE"

# Frontend URL
update_env_var "FRONTEND_URL" "http://localhost:3000" "$ENV_FILE"

# Chain configuration (testnet for local)
update_env_var "DEFAULT_CHAIN_ID" "11155111" "$ENV_FILE"  # Sepolia testnet
update_env_var "SUPPORTED_CHAINS" "11155111,80001,421614,11155420,84532" "$ENV_FILE"  # All testnets

# Security configuration
update_env_var "CORS_ORIGINS" "http://localhost:3000,http://localhost:19006,http://127.0.0.1:3000,http://127.0.0.1:19006" "$ENV_FILE"
update_env_var "RATE_LIMIT_WINDOW_MS" "900000" "$ENV_FILE"
update_env_var "RATE_LIMIT_MAX_REQUESTS" "1000" "$ENV_FILE"  # Higher limit for development

echo -e "${GREEN}✅ Local development defaults set${NC}"
echo ""

# Display summary
echo -e "${GREEN}Secret generation completed!${NC}"
echo ""
echo "Summary of generated secrets:"
echo "----------------------------"
echo "JWT_SECRET: ***${JWT_SECRET: -8} (last 8 chars)"
echo "JWT_REFRESH_SECRET: ***${JWT_REFRESH_SECRET: -8} (last 8 chars)"
echo "ENCRYPTION_SECRET: ***${ENCRYPTION_SECRET: -8} (last 8 chars)"
echo ""
echo -e "${YELLOW}Important notes:${NC}"
echo "- MPC is disabled by default for local testing (DISABLE_MPC=true)"
echo "- Login is enabled for security (BYPASS_LOGIN=false)"
echo "- Using testnet chains for local development"
echo "- CORS is configured for common local development URLs"
echo ""
echo -e "${BLUE}To enable MPC testing:${NC}"
echo "1. Set DISABLE_MPC=false in .env"
echo "2. Ensure MPC services are running locally"
echo "3. Update SILENCE_ADMIN_TOKEN with a valid token"
echo ""
echo -e "${BLUE}To bypass login for testing:${NC}"
echo "1. Set BYPASS_LOGIN=true in .env"
echo "2. Restart the server"
echo ""
echo -e "${GREEN}✅ Environment ready for local development!${NC}"