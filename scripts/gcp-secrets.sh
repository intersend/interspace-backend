#!/bin/bash
#
# GCP Secrets Management Script - Interspace Platform
# Version: 1.0.0
# Usage: ./gcp-secrets.sh [create|rotate|backup|restore|list]
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
PROJECT_NUMBER="784862970473"
REGION="us-central1"
BACKUP_BUCKET="interspace-secrets-backup-${PROJECT_NUMBER}"
ENCRYPTION_KEY_FILE="${HOME}/.interspace/backup-key.txt"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Secret definitions
declare -A SECRETS=(
    # Database URLs (will be generated based on actual IPs)
    ["interspace-dev-database-url"]="DATABASE_URL"
    ["interspace-prod-database-url"]="DATABASE_URL"
    
    # JWT Secrets
    ["interspace-jwt-secret"]="RANDOM_64"
    ["interspace-jwt-refresh-secret"]="RANDOM_64"
    ["interspace-encryption-secret"]="RANDOM_HEX_32"
    ["interspace-prod-jwt-secret"]="RANDOM_64"
    ["interspace-prod-jwt-refresh-secret"]="RANDOM_64"
    ["interspace-prod-encryption-secret"]="RANDOM_HEX_32"
    
    # OAuth
    ["interspace-google-client-id"]="MANUAL"
    ["interspace-apple-client-id"]="MANUAL"
    
    # Third-party services
    ["interspace-orby-private-key"]="MANUAL"
    ["interspace-orby-public-key"]="MANUAL"
    ["interspace-silence-admin-token"]="MANUAL"
    ["interspace-prod-silence-admin-token"]="MANUAL"
    
    # Email service
    ["interspace-dev-sendgrid-key"]="MANUAL"
    ["interspace-prod-sendgrid-key"]="MANUAL"
    
    # Monitoring
    ["interspace-dev-slack-webhook"]="MANUAL"
    ["interspace-prod-slack-webhook"]="MANUAL"
    ["interspace-prod-discord-webhook"]="MANUAL"
    ["interspace-prod-pagerduty-key"]="MANUAL"
    
    # Redis URLs (will be generated)
    ["interspace-dev-redis-url"]="REDIS_URL"
    ["interspace-prod-redis-url"]="REDIS_URL"
)

# Usage
usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  create    Create all secrets"
    echo "  rotate    Rotate specified secrets"
    echo "  backup    Backup all secrets"
    echo "  restore   Restore secrets from backup"
    echo "  list      List all secrets"
    echo "  audit     Show secret access audit log"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -s, --secret NAME   Specific secret to operate on"
    echo "  -e, --env ENV       Environment (dev|prod)"
    echo "  -f, --force         Force operation without confirmation"
    exit 1
}

# Generate random secret
generate_secret() {
    local TYPE=$1
    
    case $TYPE in
        "RANDOM_64")
            openssl rand -base64 64 | tr -d '\n'
            ;;
        "RANDOM_HEX_32")
            openssl rand -hex 32
            ;;
        "RANDOM_32")
            openssl rand -base64 32 | tr -d '\n'
            ;;
        *)
            echo ""
            ;;
    esac
}

# Get database URL
get_database_url() {
    local ENV=$1
    
    # Get database IP
    DB_IP=$(gcloud sql instances describe "interspace-db-$ENV" \
        --format="value(ipAddresses[0].ipAddress)" 2>/dev/null || echo "")
    
    if [ -z "$DB_IP" ]; then
        log_error "Database interspace-db-$ENV not found"
        return 1
    fi
    
    # Get password from existing secret or generate new one
    if gcloud secrets describe "interspace-$ENV-database-password" &> /dev/null; then
        DB_PASSWORD=$(gcloud secrets versions access latest \
            --secret="interspace-$ENV-database-password")
    else
        DB_PASSWORD=$(generate_secret "RANDOM_32")
        echo -n "$DB_PASSWORD" | gcloud secrets create "interspace-$ENV-database-password" \
            --data-file=- &> /dev/null
    fi
    
    echo "postgresql://interspace_$ENV:$DB_PASSWORD@$DB_IP:5432/interspace_$ENV?schema=public&sslmode=require"
}

# Get Redis URL
get_redis_url() {
    local ENV=$1
    
    # Get Redis details
    REDIS_HOST=$(gcloud redis instances describe "interspace-redis-$ENV" \
        --region="$REGION" --format="value(host)" 2>/dev/null || echo "")
    
    if [ -z "$REDIS_HOST" ]; then
        log_error "Redis interspace-redis-$ENV not found"
        return 1
    fi
    
    REDIS_PORT=$(gcloud redis instances describe "interspace-redis-$ENV" \
        --region="$REGION" --format="value(port)" 2>/dev/null || echo "6379")
    
    # Check if auth is enabled (production)
    if [ "$ENV" = "prod" ]; then
        AUTH_STRING=$(gcloud redis instances describe "interspace-redis-$ENV" \
            --region="$REGION" --format="value(authString)" 2>/dev/null || echo "")
        
        if [ -n "$AUTH_STRING" ]; then
            echo "redis://:$AUTH_STRING@$REDIS_HOST:$REDIS_PORT/0"
        else
            echo "redis://$REDIS_HOST:$REDIS_PORT/0"
        fi
    else
        echo "redis://$REDIS_HOST:$REDIS_PORT/0"
    fi
}

# Create secret
create_secret() {
    local SECRET_NAME=$1
    local SECRET_TYPE=${SECRETS[$SECRET_NAME]}
    local SECRET_VALUE=""
    
    # Check if secret already exists
    if gcloud secrets describe "$SECRET_NAME" &> /dev/null; then
        log_warning "Secret $SECRET_NAME already exists"
        return 0
    fi
    
    # Generate or get secret value
    case $SECRET_TYPE in
        "DATABASE_URL")
            if [[ $SECRET_NAME == *"dev"* ]]; then
                SECRET_VALUE=$(get_database_url "dev")
            else
                SECRET_VALUE=$(get_database_url "prod")
            fi
            ;;
        "REDIS_URL")
            if [[ $SECRET_NAME == *"dev"* ]]; then
                SECRET_VALUE=$(get_redis_url "dev")
            else
                SECRET_VALUE=$(get_redis_url "prod")
            fi
            ;;
        "MANUAL")
            echo -n "Enter value for $SECRET_NAME: "
            read -s SECRET_VALUE
            echo ""
            ;;
        *)
            SECRET_VALUE=$(generate_secret "$SECRET_TYPE")
            ;;
    esac
    
    if [ -z "$SECRET_VALUE" ]; then
        log_error "Failed to generate value for $SECRET_NAME"
        return 1
    fi
    
    # Create the secret
    echo -n "$SECRET_VALUE" | gcloud secrets create "$SECRET_NAME" \
        --data-file=- \
        --replication-policy="automatic"
    
    log_success "Created secret: $SECRET_NAME"
}

# Create all secrets
create_all_secrets() {
    log_info "Creating all secrets..."
    
    # Create secrets in order
    for SECRET_NAME in "${!SECRETS[@]}"; do
        create_secret "$SECRET_NAME"
    done
    
    log_success "All secrets created"
}

# Rotate secret
rotate_secret() {
    local SECRET_NAME=$1
    local SECRET_TYPE=${SECRETS[$SECRET_NAME]:-""}
    
    if [ -z "$SECRET_TYPE" ]; then
        log_error "Unknown secret: $SECRET_NAME"
        return 1
    fi
    
    # Check if secret exists
    if ! gcloud secrets describe "$SECRET_NAME" &> /dev/null; then
        log_error "Secret $SECRET_NAME does not exist"
        return 1
    fi
    
    log_info "Rotating secret: $SECRET_NAME"
    
    # Generate new value
    case $SECRET_TYPE in
        "DATABASE_URL"|"REDIS_URL")
            log_error "Cannot rotate $SECRET_TYPE automatically. Update infrastructure first."
            return 1
            ;;
        "MANUAL")
            echo -n "Enter new value for $SECRET_NAME: "
            read -s NEW_VALUE
            echo ""
            ;;
        *)
            NEW_VALUE=$(generate_secret "$SECRET_TYPE")
            ;;
    esac
    
    # Add new version
    echo -n "$NEW_VALUE" | gcloud secrets versions add "$SECRET_NAME" --data-file=-
    
    # Get old version number
    OLD_VERSION=$(gcloud secrets versions list "$SECRET_NAME" \
        --format="value(name)" \
        --filter="state=ENABLED" \
        --limit=2 | tail -1 | awk -F'/' '{print $NF}')
    
    log_success "Rotated secret: $SECRET_NAME"
    log_info "New version created. Old version: $OLD_VERSION"
    
    # Prompt to disable old version
    if [ "${FORCE:-false}" != "true" ]; then
        read -p "Disable old version $OLD_VERSION? (y/n): " DISABLE
        if [ "$DISABLE" = "y" ]; then
            gcloud secrets versions disable "$OLD_VERSION" --secret="$SECRET_NAME"
            log_success "Disabled old version"
        fi
    fi
}

# Backup secrets
backup_secrets() {
    log_info "Backing up all secrets..."
    
    # Create backup directory
    BACKUP_DIR="/tmp/interspace-secrets-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Create backup bucket if it doesn't exist
    if ! gsutil ls "gs://$BACKUP_BUCKET" &> /dev/null; then
        log_info "Creating backup bucket..."
        gsutil mb -p "$PROJECT_ID" -c standard -l "$REGION" "gs://$BACKUP_BUCKET"
        gsutil iam ch allUsers:objectViewer "gs://$BACKUP_BUCKET" &> /dev/null || true
    fi
    
    # Generate encryption key if it doesn't exist
    if [ ! -f "$ENCRYPTION_KEY_FILE" ]; then
        mkdir -p "$(dirname "$ENCRYPTION_KEY_FILE")"
        openssl rand -hex 32 > "$ENCRYPTION_KEY_FILE"
        chmod 600 "$ENCRYPTION_KEY_FILE"
        log_info "Generated new backup encryption key"
    fi
    
    # Backup each secret
    for SECRET_NAME in "${!SECRETS[@]}"; do
        if gcloud secrets describe "$SECRET_NAME" &> /dev/null; then
            log_info "Backing up $SECRET_NAME..."
            
            # Get secret value
            gcloud secrets versions access latest --secret="$SECRET_NAME" \
                > "$BACKUP_DIR/$SECRET_NAME.txt"
            
            # Encrypt the secret
            openssl enc -aes-256-cbc -salt -pbkdf2 \
                -in "$BACKUP_DIR/$SECRET_NAME.txt" \
                -out "$BACKUP_DIR/$SECRET_NAME.enc" \
                -pass "file:$ENCRYPTION_KEY_FILE"
            
            # Remove unencrypted file
            rm "$BACKUP_DIR/$SECRET_NAME.txt"
        fi
    done
    
    # Create backup metadata
    cat > "$BACKUP_DIR/metadata.json" <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "project_id": "$PROJECT_ID",
    "secrets_count": $(ls -1 "$BACKUP_DIR"/*.enc 2>/dev/null | wc -l),
    "created_by": "$(gcloud config get-value account)"
}
EOF
    
    # Create tarball
    BACKUP_FILE="secrets-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "/tmp/$BACKUP_FILE" -C "$BACKUP_DIR" .
    
    # Upload to GCS
    gsutil cp "/tmp/$BACKUP_FILE" "gs://$BACKUP_BUCKET/"
    
    # Cleanup
    rm -rf "$BACKUP_DIR" "/tmp/$BACKUP_FILE"
    
    log_success "Backup completed: gs://$BACKUP_BUCKET/$BACKUP_FILE"
}

# Restore secrets
restore_secrets() {
    log_info "Restoring secrets from backup..."
    
    # List available backups
    echo "Available backups:"
    gsutil ls "gs://$BACKUP_BUCKET/secrets-backup-*.tar.gz" | \
        awk -F'/' '{print $NF}' | nl
    
    echo -n "Enter backup number to restore: "
    read BACKUP_NUM
    
    BACKUP_FILE=$(gsutil ls "gs://$BACKUP_BUCKET/secrets-backup-*.tar.gz" | \
        awk -F'/' '{print $NF}' | sed -n "${BACKUP_NUM}p")
    
    if [ -z "$BACKUP_FILE" ]; then
        log_error "Invalid backup selection"
        return 1
    fi
    
    log_warning "⚠️  This will overwrite existing secrets!"
    if [ "${FORCE:-false}" != "true" ]; then
        read -p "Continue? (yes/no): " CONFIRM
        if [ "$CONFIRM" != "yes" ]; then
            log_info "Restore cancelled"
            return 0
        fi
    fi
    
    # Download and extract backup
    RESTORE_DIR="/tmp/interspace-secrets-restore-$$"
    mkdir -p "$RESTORE_DIR"
    
    gsutil cp "gs://$BACKUP_BUCKET/$BACKUP_FILE" "/tmp/$BACKUP_FILE"
    tar -xzf "/tmp/$BACKUP_FILE" -C "$RESTORE_DIR"
    
    # Check encryption key
    if [ ! -f "$ENCRYPTION_KEY_FILE" ]; then
        log_error "Encryption key not found at $ENCRYPTION_KEY_FILE"
        return 1
    fi
    
    # Restore each secret
    for ENC_FILE in "$RESTORE_DIR"/*.enc; do
        if [ -f "$ENC_FILE" ]; then
            SECRET_NAME=$(basename "$ENC_FILE" .enc)
            log_info "Restoring $SECRET_NAME..."
            
            # Decrypt
            openssl enc -aes-256-cbc -d -pbkdf2 \
                -in "$ENC_FILE" \
                -out "$RESTORE_DIR/$SECRET_NAME.txt" \
                -pass "file:$ENCRYPTION_KEY_FILE"
            
            # Create or update secret
            if gcloud secrets describe "$SECRET_NAME" &> /dev/null; then
                gcloud secrets versions add "$SECRET_NAME" \
                    --data-file="$RESTORE_DIR/$SECRET_NAME.txt"
            else
                gcloud secrets create "$SECRET_NAME" \
                    --data-file="$RESTORE_DIR/$SECRET_NAME.txt" \
                    --replication-policy="automatic"
            fi
        fi
    done
    
    # Cleanup
    rm -rf "$RESTORE_DIR" "/tmp/$BACKUP_FILE"
    
    log_success "Restore completed from $BACKUP_FILE"
}

# List secrets
list_secrets() {
    echo "=================================================="
    echo "   Secrets Overview"
    echo "=================================================="
    echo ""
    
    # Get all secrets
    EXISTING_SECRETS=$(gcloud secrets list --format="value(name)" | grep -E "^interspace-" || true)
    
    if [ -z "$EXISTING_SECRETS" ]; then
        log_warning "No secrets found"
        return 0
    fi
    
    # Table header
    printf "%-50s %-15s %-10s %-20s\n" "SECRET NAME" "VERSIONS" "STATE" "CREATED"
    printf "%-50s %-15s %-10s %-20s\n" "-----------" "--------" "-----" "-------"
    
    # List each secret
    while IFS= read -r SECRET; do
        # Get latest version info
        VERSION_INFO=$(gcloud secrets versions list "$SECRET" \
            --limit=1 \
            --format="value(name,state,createTime)")
        
        VERSION=$(echo "$VERSION_INFO" | awk '{print $1}' | awk -F'/' '{print $NF}')
        STATE=$(echo "$VERSION_INFO" | awk '{print $2}')
        CREATED=$(echo "$VERSION_INFO" | awk '{print $3}' | cut -d'T' -f1)
        
        # Get total versions
        TOTAL_VERSIONS=$(gcloud secrets versions list "$SECRET" \
            --format="value(name)" | wc -l)
        
        printf "%-50s %-15s %-10s %-20s\n" "$SECRET" "$VERSION ($TOTAL_VERSIONS)" "$STATE" "$CREATED"
    done <<< "$EXISTING_SECRETS"
    
    echo ""
}

# Audit secret access
audit_secrets() {
    log_info "Fetching secret access audit logs..."
    
    # Time range (last 24 hours)
    START_TIME=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
    
    echo "=================================================="
    echo "   Secret Access Audit (Last 24 Hours)"
    echo "=================================================="
    echo ""
    
    # Query audit logs
    gcloud logging read \
        "resource.type=\"secretmanager.googleapis.com/Secret\"
         AND protoPayload.methodName=\"google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion\"
         AND timestamp>=\"$START_TIME\"" \
        --limit=100 \
        --format="json" | \
    jq -r '.[] | 
        "\(.timestamp | split("T")[0]) \(.timestamp | split("T")[1] | split(".")[0]) | \(.protoPayload.authenticationInfo.principalEmail) | \(.protoPayload.request.name | split("/") | .[3])"' | \
    column -t -s '|' -N "DATE,TIME,USER,SECRET"
    
    echo ""
}

# Main function
main() {
    COMMAND=""
    SECRET_NAME=""
    ENVIRONMENT=""
    FORCE=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                ;;
            -s|--secret)
                SECRET_NAME="$2"
                shift 2
                ;;
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            create|rotate|backup|restore|list|audit)
                COMMAND=$1
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    if [ -z "$COMMAND" ]; then
        usage
    fi
    
    # Check prerequisites
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not installed"
        exit 1
    fi
    
    # Execute command
    case $COMMAND in
        create)
            if [ -n "$SECRET_NAME" ]; then
                create_secret "$SECRET_NAME"
            else
                create_all_secrets
            fi
            ;;
        rotate)
            if [ -z "$SECRET_NAME" ]; then
                log_error "Secret name required for rotation"
                usage
            fi
            rotate_secret "$SECRET_NAME"
            ;;
        backup)
            backup_secrets
            ;;
        restore)
            restore_secrets
            ;;
        list)
            list_secrets
            ;;
        audit)
            audit_secrets
            ;;
        *)
            log_error "Invalid command: $COMMAND"
            usage
            ;;
    esac
}

# Run main
main "$@"