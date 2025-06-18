#!/bin/bash
#
# GCP Infrastructure Provisioning Script - Interspace Platform
# Version: 1.0.0
# Usage: ./gcp-infrastructure.sh [create|destroy|status]
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
ZONE="us-central1-f"
VPC_NAME="interspace-vpc"
SUBNET_NAME="interspace-subnet"
CONNECTOR_NAME="interspace-connector"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Usage
usage() {
    echo "Usage: $0 [create|destroy|status]"
    echo ""
    echo "Commands:"
    echo "  create   Create all infrastructure components"
    echo "  destroy  Destroy all infrastructure (USE WITH CAUTION)"
    echo "  status   Show current infrastructure status"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -y, --yes      Skip confirmation prompts"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not installed"
        exit 1
    fi
    
    CURRENT_PROJECT=$(gcloud config get-value project)
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        log_error "Wrong project. Expected: $PROJECT_ID, Current: $CURRENT_PROJECT"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Enable APIs
enable_apis() {
    log_info "Enabling required Google Cloud APIs..."
    
    APIS=(
        "cloudrun.googleapis.com"
        "cloudbuild.googleapis.com"
        "secretmanager.googleapis.com"
        "sqladmin.googleapis.com"
        "compute.googleapis.com"
        "vpcaccess.googleapis.com"
        "servicenetworking.googleapis.com"
        "redis.googleapis.com"
        "artifactregistry.googleapis.com"
        "iam.googleapis.com"
        "cloudkms.googleapis.com"
        "monitoring.googleapis.com"
        "logging.googleapis.com"
    )
    
    for API in "${APIS[@]}"; do
        log_info "Enabling $API..."
        gcloud services enable "$API" || true
    done
    
    log_success "APIs enabled"
}

# Create VPC network
create_vpc() {
    log_info "Creating VPC network..."
    
    # Create VPC
    if gcloud compute networks describe "$VPC_NAME" &> /dev/null; then
        log_warning "VPC $VPC_NAME already exists"
    else
        gcloud compute networks create "$VPC_NAME" \
            --subnet-mode=custom \
            --bgp-routing-mode=regional
        log_success "VPC created"
    fi
    
    # Create main subnet
    if gcloud compute networks subnets describe "$SUBNET_NAME" \
         --region="$REGION" &> /dev/null; then
        log_warning "Subnet $SUBNET_NAME already exists"
    else
        gcloud compute networks subnets create "$SUBNET_NAME" \
            --network="$VPC_NAME" \
            --region="$REGION" \
            --range=10.0.0.0/20 \
            --enable-private-ip-google-access \
            --enable-flow-logs \
            --logging-aggregation-interval=interval-5-sec \
            --logging-flow-sampling=0.5
        log_success "Subnet created"
    fi
    
    # Create connector subnet
    if gcloud compute networks subnets describe "${CONNECTOR_NAME}-subnet" \
         --region="$REGION" &> /dev/null; then
        log_warning "Connector subnet already exists"
    else
        gcloud compute networks subnets create "${CONNECTOR_NAME}-subnet" \
            --network="$VPC_NAME" \
            --region="$REGION" \
            --range=10.8.0.0/28
        log_success "Connector subnet created"
    fi
}

# Create VPC connector
create_vpc_connector() {
    log_info "Creating VPC connector..."
    
    if gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
         --region="$REGION" &> /dev/null; then
        log_warning "VPC connector already exists"
    else
        gcloud compute networks vpc-access connectors create "$CONNECTOR_NAME" \
            --region="$REGION" \
            --subnet="${CONNECTOR_NAME}-subnet" \
            --subnet-project="$PROJECT_ID" \
            --min-instances=2 \
            --max-instances=10 \
            --machine-type=f1-micro
        log_success "VPC connector created"
    fi
}

# Create private service connection
create_private_service_connection() {
    log_info "Creating private service connection..."
    
    # Reserve IP range
    if gcloud compute addresses describe google-managed-services-interspace \
         --global &> /dev/null; then
        log_warning "IP range already reserved"
    else
        gcloud compute addresses create google-managed-services-interspace \
            --global \
            --purpose=VPC_PEERING \
            --prefix-length=16 \
            --network="$VPC_NAME"
        log_success "IP range reserved"
    fi
    
    # Create private connection
    log_info "Creating VPC peering connection..."
    gcloud services vpc-peerings connect \
        --service=servicenetworking.googleapis.com \
        --ranges=google-managed-services-interspace \
        --network="$VPC_NAME" || true
}

# Create Cloud SQL instances
create_cloud_sql() {
    log_info "Creating Cloud SQL instances..."
    
    # Development database
    if gcloud sql instances describe interspace-db-dev &> /dev/null; then
        log_warning "Development database already exists"
    else
        log_info "Creating development database..."
        gcloud sql instances create interspace-db-dev \
            --database-version=POSTGRES_15 \
            --tier=db-g1-small \
            --region="$REGION" \
            --network="projects/$PROJECT_ID/global/networks/$VPC_NAME" \
            --no-assign-ip \
            --backup-start-time=03:00 \
            --require-ssl \
            --enable-point-in-time-recovery \
            --retained-backups-count=7 \
            --retained-transaction-log-days=7
        
        # Create database and user
        gcloud sql databases create interspace_dev --instance=interspace-db-dev
        
        DEV_DB_PASSWORD=$(openssl rand -base64 32)
        gcloud sql users create interspace_dev \
            --instance=interspace-db-dev \
            --password="$DEV_DB_PASSWORD"
        
        log_success "Development database created"
        log_info "Dev DB Password: $DEV_DB_PASSWORD"
    fi
    
    # Production database
    if gcloud sql instances describe interspace-db-prod &> /dev/null; then
        log_warning "Production database already exists"
    else
        log_info "Creating production database (this may take a while)..."
        gcloud sql instances create interspace-db-prod \
            --database-version=POSTGRES_15 \
            --tier=db-custom-2-8192 \
            --region="$REGION" \
            --network="projects/$PROJECT_ID/global/networks/$VPC_NAME" \
            --no-assign-ip \
            --availability-type=REGIONAL \
            --backup-start-time=03:00 \
            --require-ssl \
            --enable-point-in-time-recovery \
            --retained-backups-count=30 \
            --retained-transaction-log-days=7
        
        # Create database and user
        gcloud sql databases create interspace_prod --instance=interspace-db-prod
        
        PROD_DB_PASSWORD=$(openssl rand -base64 32)
        gcloud sql users create interspace_prod \
            --instance=interspace-db-prod \
            --password="$PROD_DB_PASSWORD"
        
        log_success "Production database created"
        log_info "Prod DB Password: $PROD_DB_PASSWORD"
    fi
}

# Create Redis instances
create_redis() {
    log_info "Creating Redis instances..."
    
    # Development Redis
    if gcloud redis instances describe interspace-redis-dev \
         --region="$REGION" &> /dev/null; then
        log_warning "Development Redis already exists"
    else
        log_info "Creating development Redis..."
        gcloud redis instances create interspace-redis-dev \
            --region="$REGION" \
            --tier=basic \
            --size=1 \
            --redis-version=redis_7_2 \
            --display-name="Interspace Redis Dev" \
            --network="projects/$PROJECT_ID/global/networks/$VPC_NAME"
        log_success "Development Redis created"
    fi
    
    # Production Redis
    if gcloud redis instances describe interspace-redis-prod \
         --region="$REGION" &> /dev/null; then
        log_warning "Production Redis already exists"
    else
        log_info "Creating production Redis (this may take a while)..."
        gcloud redis instances create interspace-redis-prod \
            --region="$REGION" \
            --tier=standard \
            --size=5 \
            --redis-version=redis_7_2 \
            --replica-count=1 \
            --display-name="Interspace Redis Production" \
            --network="projects/$PROJECT_ID/global/networks/$VPC_NAME"
        log_success "Production Redis created"
    fi
}

# Create Artifact Registry
create_artifact_registry() {
    log_info "Creating Artifact Registry..."
    
    if gcloud artifacts repositories describe interspace-docker \
         --location="$REGION" &> /dev/null; then
        log_warning "Artifact Registry already exists"
    else
        gcloud artifacts repositories create interspace-docker \
            --repository-format=docker \
            --location="$REGION" \
            --description="Docker images for Interspace services"
        log_success "Artifact Registry created"
    fi
    
    # Configure Docker authentication
    gcloud auth configure-docker "${REGION}-docker.pkg.dev"
}

# Create service accounts
create_service_accounts() {
    log_info "Creating service accounts..."
    
    SERVICES=("backend" "duo")
    ENVIRONMENTS=("dev" "prod")
    
    for SERVICE in "${SERVICES[@]}"; do
        for ENV in "${ENVIRONMENTS[@]}"; do
            SA_NAME="interspace-$SERVICE-$ENV"
            SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
            
            if gcloud iam service-accounts describe "$SA_EMAIL" &> /dev/null; then
                log_warning "Service account $SA_NAME already exists"
            else
                gcloud iam service-accounts create "$SA_NAME" \
                    --display-name="Interspace ${SERVICE^} ${ENV^}"
                log_success "Created service account $SA_NAME"
            fi
        done
    done
    
    # Grant permissions
    log_info "Granting IAM permissions..."
    
    # Backend permissions
    for ENV in "${ENVIRONMENTS[@]}"; do
        SA="interspace-backend-$ENV@$PROJECT_ID.iam.gserviceaccount.com"
        
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA" \
            --role="roles/cloudsql.client" &> /dev/null
        
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA" \
            --role="roles/secretmanager.secretAccessor" &> /dev/null
        
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA" \
            --role="roles/run.invoker" &> /dev/null
        
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA" \
            --role="roles/redis.editor" &> /dev/null
    done
    
    # Duo node permissions
    for ENV in "${ENVIRONMENTS[@]}"; do
        SA="interspace-duo-$ENV@$PROJECT_ID.iam.gserviceaccount.com"
        
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA" \
            --role="roles/secretmanager.secretAccessor" &> /dev/null
    done
    
    log_success "IAM permissions granted"
}

# Create firewall rules
create_firewall_rules() {
    log_info "Creating firewall rules..."
    
    # Deny all ingress by default
    if gcloud compute firewall-rules describe deny-all-ingress &> /dev/null; then
        log_warning "Firewall rule deny-all-ingress already exists"
    else
        gcloud compute firewall-rules create deny-all-ingress \
            --network="$VPC_NAME" \
            --action=deny \
            --direction=ingress \
            --priority=65534 \
            --source-ranges=0.0.0.0/0 \
            --rules=all
        log_success "Created deny-all-ingress rule"
    fi
    
    # Allow health checks
    if gcloud compute firewall-rules describe allow-health-checks &> /dev/null; then
        log_warning "Firewall rule allow-health-checks already exists"
    else
        gcloud compute firewall-rules create allow-health-checks \
            --network="$VPC_NAME" \
            --action=allow \
            --direction=ingress \
            --priority=900 \
            --source-ranges=35.191.0.0/16,130.211.0.0/22 \
            --rules=tcp:3000,tcp:3001
        log_success "Created allow-health-checks rule"
    fi
}

# Show infrastructure status
show_status() {
    echo "=================================================="
    echo "   Infrastructure Status"
    echo "=================================================="
    echo ""
    
    # VPC Status
    echo "VPC Network:"
    gcloud compute networks describe "$VPC_NAME" \
        --format="table(name,autoCreateSubnetworks,creationTimestamp)" 2>/dev/null || \
        echo "  - Not created"
    echo ""
    
    # VPC Connector Status
    echo "VPC Connector:"
    gcloud compute networks vpc-access connectors describe "$CONNECTOR_NAME" \
        --region="$REGION" \
        --format="table(name,state,minInstances,maxInstances)" 2>/dev/null || \
        echo "  - Not created"
    echo ""
    
    # Database Status
    echo "Cloud SQL Instances:"
    gcloud sql instances list --format="table(name,state,tier,region)" 2>/dev/null || \
        echo "  - None"
    echo ""
    
    # Redis Status
    echo "Redis Instances:"
    gcloud redis instances list --region="$REGION" \
        --format="table(name,state,tier,memorySizeGb)" 2>/dev/null || \
        echo "  - None"
    echo ""
    
    # Service Accounts
    echo "Service Accounts:"
    gcloud iam service-accounts list \
        --filter="email:interspace-*" \
        --format="table(displayName,email)" 2>/dev/null || \
        echo "  - None"
    echo ""
    
    # Artifact Registry
    echo "Artifact Registry:"
    gcloud artifacts repositories list --location="$REGION" \
        --format="table(name,format)" 2>/dev/null || \
        echo "  - None"
    echo ""
}

# Destroy infrastructure
destroy_infrastructure() {
    log_warning "⚠️  WARNING: This will destroy ALL infrastructure!"
    log_warning "This action cannot be undone!"
    echo ""
    
    if [ "${SKIP_CONFIRM:-false}" != "true" ]; then
        read -p "Type 'DESTROY' to confirm: " CONFIRM
        if [ "$CONFIRM" != "DESTROY" ]; then
            log_info "Destruction cancelled"
            exit 0
        fi
    fi
    
    log_info "Starting infrastructure destruction..."
    
    # Delete Cloud Run services
    log_info "Deleting Cloud Run services..."
    for SERVICE in backend duo-node; do
        for ENV in dev prod; do
            gcloud run services delete "interspace-$SERVICE-$ENV" \
                --region="$REGION" --quiet &> /dev/null || true
        done
    done
    
    # Delete databases
    log_info "Deleting Cloud SQL instances..."
    gcloud sql instances delete interspace-db-dev --quiet &> /dev/null || true
    gcloud sql instances delete interspace-db-prod --quiet &> /dev/null || true
    
    # Delete Redis
    log_info "Deleting Redis instances..."
    gcloud redis instances delete interspace-redis-dev \
        --region="$REGION" --quiet &> /dev/null || true
    gcloud redis instances delete interspace-redis-prod \
        --region="$REGION" --quiet &> /dev/null || true
    
    # Delete VPC connector
    log_info "Deleting VPC connector..."
    gcloud compute networks vpc-access connectors delete "$CONNECTOR_NAME" \
        --region="$REGION" --quiet &> /dev/null || true
    
    # Delete firewall rules
    log_info "Deleting firewall rules..."
    gcloud compute firewall-rules delete deny-all-ingress --quiet &> /dev/null || true
    gcloud compute firewall-rules delete allow-health-checks --quiet &> /dev/null || true
    
    # Delete subnets
    log_info "Deleting subnets..."
    gcloud compute networks subnets delete "$SUBNET_NAME" \
        --region="$REGION" --quiet &> /dev/null || true
    gcloud compute networks subnets delete "${CONNECTOR_NAME}-subnet" \
        --region="$REGION" --quiet &> /dev/null || true
    
    # Delete VPC
    log_info "Deleting VPC network..."
    gcloud compute networks delete "$VPC_NAME" --quiet &> /dev/null || true
    
    # Delete service accounts
    log_info "Deleting service accounts..."
    for SA in $(gcloud iam service-accounts list --format="value(email)" | grep interspace); do
        gcloud iam service-accounts delete "$SA" --quiet &> /dev/null || true
    done
    
    log_success "Infrastructure destruction completed"
}

# Main function
main() {
    COMMAND="${1:-}"
    SKIP_CONFIRM=false
    
    # Parse options
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                ;;
            -y|--yes)
                SKIP_CONFIRM=true
                shift
                ;;
            create|destroy|status)
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
    check_prerequisites
    
    case $COMMAND in
        create)
            log_info "Starting infrastructure creation..."
            enable_apis
            create_vpc
            create_vpc_connector
            create_private_service_connection
            create_cloud_sql
            create_redis
            create_artifact_registry
            create_service_accounts
            create_firewall_rules
            log_success "Infrastructure creation completed!"
            echo ""
            show_status
            ;;
        destroy)
            destroy_infrastructure
            ;;
        status)
            show_status
            ;;
        *)
            log_error "Invalid command: $COMMAND"
            usage
            ;;
    esac
}

# Run main
main "$@"