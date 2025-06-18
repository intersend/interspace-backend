# DEPLOYMENT OPERATIONS MANUAL - INTERSPACE PLATFORM
**Version**: 1.0.0  
**Last Updated**: 2025-06-18  
**Operational Status**: ACTIVE

## TABLE OF CONTENTS

1. [GOOGLE CLOUD SDK SETUP](#1-google-cloud-sdk-setup)
2. [INFRASTRUCTURE PROVISIONING](#2-infrastructure-provisioning)
3. [SERVICE DEPLOYMENT PROCEDURES](#3-service-deployment-procedures)
4. [SECRET MANAGEMENT OPERATIONS](#4-secret-management-operations)
5. [MONITORING & ALERTING SETUP](#5-monitoring--alerting-setup)
6. [OPERATIONAL RUNBOOKS](#6-operational-runbooks)
7. [EMERGENCY PROCEDURES](#7-emergency-procedures)

---

## 1. GOOGLE CLOUD SDK SETUP

### 1.1 Installation

#### macOS
```bash
# Install via Homebrew
brew install --cask google-cloud-sdk

# Add to shell profile (~/.zshrc or ~/.bash_profile)
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
source "/opt/homebrew/share/google-cloud-sdk/path.zsh.inc"
source "/opt/homebrew/share/google-cloud-sdk/completion.zsh.inc"
```

#### Linux
```bash
# Download and install
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Initialize
gcloud init
```

### 1.2 Authentication & Configuration

```bash
# Authenticate
gcloud auth login

# Set project
gcloud config set project intersend

# Set default region
gcloud config set compute/region us-central1
gcloud config set run/region us-central1

# Verify configuration
gcloud config list

# Application default credentials (for local development)
gcloud auth application-default login
```

### 1.3 Required Components

```bash
# Install required components
gcloud components install beta
gcloud components install gke-gcloud-auth-plugin
gcloud components install cloud-sql-proxy

# Update components
gcloud components update
```

## 2. INFRASTRUCTURE PROVISIONING

### 2.1 Project Setup

```bash
# Set environment variables
export PROJECT_ID="intersend"
export PROJECT_NUMBER="784862970473"
export REGION="us-central1"

# Enable required APIs
gcloud services enable \
  cloudrun.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  vpcaccess.googleapis.com \
  servicenetworking.googleapis.com \
  redis.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  cloudkms.googleapis.com \
  monitoring.googleapis.com \
  logging.googleapis.com
```

### 2.2 VPC Network Setup

```bash
# Create VPC
gcloud compute networks create interspace-vpc \
  --subnet-mode=custom \
  --bgp-routing-mode=regional

# Create main subnet
gcloud compute networks subnets create interspace-subnet \
  --network=interspace-vpc \
  --region=us-central1 \
  --range=10.0.0.0/20 \
  --enable-private-ip-google-access \
  --enable-flow-logs \
  --logging-aggregation-interval=interval-5-sec \
  --logging-flow-sampling=0.5

# Create connector subnet
gcloud compute networks subnets create interspace-connector-subnet \
  --network=interspace-vpc \
  --region=us-central1 \
  --range=10.8.0.0/28

# Create VPC connector
gcloud compute networks vpc-access connectors create interspace-connector \
  --region=us-central1 \
  --subnet=interspace-connector-subnet \
  --subnet-project=intersend \
  --min-instances=2 \
  --max-instances=10 \
  --machine-type=f1-micro
```

### 2.3 Private Service Connection

```bash
# Reserve IP range for Google services
gcloud compute addresses create google-managed-services-interspace \
  --global \
  --purpose=VPC_PEERING \
  --prefix-length=16 \
  --network=interspace-vpc

# Create private connection
gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=google-managed-services-interspace \
  --network=interspace-vpc
```

### 2.4 Cloud SQL Setup

```bash
# Development database
gcloud sql instances create interspace-db-dev \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=us-central1 \
  --network=projects/$PROJECT_ID/global/networks/interspace-vpc \
  --no-assign-ip \
  --backup-start-time=03:00 \
  --require-ssl \
  --enable-point-in-time-recovery \
  --retained-backups-count=7 \
  --retained-transaction-log-days=7

# Production database (HA)
gcloud sql instances create interspace-db-prod \
  --database-version=POSTGRES_15 \
  --tier=db-custom-2-8192 \
  --region=us-central1 \
  --network=projects/$PROJECT_ID/global/networks/interspace-vpc \
  --no-assign-ip \
  --availability-type=REGIONAL \
  --backup-start-time=03:00 \
  --require-ssl \
  --enable-point-in-time-recovery \
  --retained-backups-count=30 \
  --retained-transaction-log-days=7

# Create databases and users
for ENV in dev prod; do
  gcloud sql databases create interspace_$ENV --instance=interspace-db-$ENV
  
  # Generate secure password
  DB_PASSWORD=$(openssl rand -base64 32)
  echo "Database password for $ENV: $DB_PASSWORD"
  
  # Create user
  gcloud sql users create interspace_$ENV \
    --instance=interspace-db-$ENV \
    --password=$DB_PASSWORD
done
```

### 2.5 Redis Setup

```bash
# Development Redis
gcloud redis instances create interspace-redis-dev \
  --region=us-central1 \
  --tier=basic \
  --size=1 \
  --redis-version=redis_7_2 \
  --display-name="Interspace Redis Dev" \
  --network=projects/$PROJECT_ID/global/networks/interspace-vpc

# Production Redis (with HA)
gcloud redis instances create interspace-redis-prod \
  --region=us-central1 \
  --tier=standard \
  --size=5 \
  --redis-version=redis_7_2 \
  --replica-count=1 \
  --display-name="Interspace Redis Production" \
  --network=projects/$PROJECT_ID/global/networks/interspace-vpc
```

### 2.6 Artifact Registry

```bash
# Create Docker repository
gcloud artifacts repositories create interspace-docker \
  --repository-format=docker \
  --location=us-central1 \
  --description="Docker images for Interspace services"

# Configure Docker authentication
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 2.7 Service Accounts

```bash
# Create service accounts
for SERVICE in backend duo; do
  for ENV in dev prod; do
    gcloud iam service-accounts create interspace-$SERVICE-$ENV \
      --display-name="Interspace ${SERVICE^} ${ENV^}"
  done
done

# Grant permissions to backend service accounts
for ENV in dev prod; do
  SA="interspace-backend-$ENV@$PROJECT_ID.iam.gserviceaccount.com"
  
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA" \
    --role="roles/cloudsql.client"
  
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
  
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA" \
    --role="roles/run.invoker"
  
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA" \
    --role="roles/redis.editor"
done

# Grant permissions to duo node service accounts
for ENV in dev prod; do
  SA="interspace-duo-$ENV@$PROJECT_ID.iam.gserviceaccount.com"
  
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 3. SERVICE DEPLOYMENT PROCEDURES

### 3.1 Pre-Deployment Validation

```bash
#!/bin/bash
# Pre-deployment validation script

echo "=== Pre-Deployment Validation ==="

# Check project
PROJECT=$(gcloud config get-value project)
if [ "$PROJECT" != "intersend" ]; then
  echo "ERROR: Wrong project. Expected: intersend, Got: $PROJECT"
  exit 1
fi

# Check APIs enabled
REQUIRED_APIS=(
  "cloudrun.googleapis.com"
  "cloudbuild.googleapis.com"
  "secretmanager.googleapis.com"
)

for API in "${REQUIRED_APIS[@]}"; do
  if ! gcloud services list --enabled | grep -q "$API"; then
    echo "ERROR: $API is not enabled"
    exit 1
  fi
done

# Check VPC connector
if ! gcloud compute networks vpc-access connectors describe interspace-connector \
     --region=us-central1 &>/dev/null; then
  echo "ERROR: VPC connector not found"
  exit 1
fi

echo "✓ Pre-deployment validation passed"
```

### 3.2 Backend Deployment

#### Development Deployment
```bash
cd /path/to/interspace-backend

# Run tests
npm test

# Build and deploy
gcloud builds submit --config=cloudbuild.dev.yaml

# Verify deployment
SERVICE_URL=$(gcloud run services describe interspace-backend-dev \
  --region=us-central1 \
  --format="value(status.url)")

curl -f "$SERVICE_URL/health" || echo "Health check failed"
```

#### Production Deployment
```bash
# Tag the release
git tag -a v1.0.0 -m "Production release v1.0.0"
git push origin v1.0.0

# Deploy with approval
gcloud builds submit --config=cloudbuild.prod.yaml

# Gradual rollout (implemented in cloudbuild.prod.yaml)
# 0% → 10% → 50% → 100% traffic migration
```

### 3.3 Duo Node Deployment

#### Deployment Steps
```bash
cd /path/to/interspace-duo-node

# Deploy development
gcloud builds submit --config=cloudbuild.dev.yaml

# Deploy production
gcloud builds submit --config=cloudbuild.prod.yaml

# Remove public access
for ENV in dev prod; do
  gcloud run services update interspace-duo-node-$ENV \
    --no-allow-unauthenticated \
    --region=us-central1
done

# Grant backend access to duo-node
for ENV in dev prod; do
  gcloud run services add-iam-policy-binding interspace-duo-node-$ENV \
    --member="serviceAccount:interspace-backend-$ENV@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.invoker" \
    --region=us-central1
done
```

### 3.4 Database Migration

```bash
# Create migration job
gcloud run jobs create interspace-db-migrate-dev \
  --image=us-central1-docker.pkg.dev/$PROJECT_ID/interspace-docker/interspace-backend-dev:latest \
  --region=us-central1 \
  --set-env-vars="NODE_ENV=development" \
  --set-secrets="DATABASE_URL=interspace-dev-database-url:latest" \
  --vpc-connector=projects/$PROJECT_ID/locations/us-central1/connectors/interspace-connector \
  --vpc-egress=private-ranges-only \
  --service-account=interspace-backend-dev@$PROJECT_ID.iam.gserviceaccount.com \
  --parallelism=1 \
  --task-timeout=3600 \
  --command="npm" \
  --args="run,prisma:migrate:deploy"

# Execute migration
gcloud run jobs execute interspace-db-migrate-dev --region=us-central1 --wait
```

### 3.5 Post-Deployment Verification

```bash
#!/bin/bash
# Post-deployment verification

echo "=== Post-Deployment Verification ==="

# Check service status
for SERVICE in backend duo-node; do
  for ENV in dev prod; do
    STATUS=$(gcloud run services describe interspace-$SERVICE-$ENV \
      --region=us-central1 \
      --format="value(status.conditions[0].status)")
    
    if [ "$STATUS" = "True" ]; then
      echo "✓ $SERVICE-$ENV is healthy"
    else
      echo "✗ $SERVICE-$ENV is unhealthy"
    fi
  done
done

# Test endpoints
BACKEND_URL=$(gcloud run services describe interspace-backend-dev \
  --region=us-central1 \
  --format="value(status.url)")

# Health check
curl -f "$BACKEND_URL/health" && echo "✓ Health check passed"

# API version
curl -f "$BACKEND_URL/api/v1/version" && echo "✓ API responding"
```

## 4. SECRET MANAGEMENT OPERATIONS

### 4.1 Secret Creation

```bash
#!/bin/bash
# Secret creation script

# Generate secure secrets
generate_secret() {
  openssl rand -base64 64 | tr -d '\n'
}

# JWT Secrets
for ENV in dev prod; do
  echo -n "$(generate_secret)" | \
    gcloud secrets create interspace-$ENV-jwt-secret --data-file=-
  
  echo -n "$(generate_secret)" | \
    gcloud secrets create interspace-$ENV-jwt-refresh-secret --data-file=-
done

# Encryption secrets (32 bytes hex)
for ENV in dev prod; do
  echo -n "$(openssl rand -hex 32)" | \
    gcloud secrets create interspace-$ENV-encryption-secret --data-file=-
done
```

### 4.2 Secret Rotation

```bash
#!/bin/bash
# Secret rotation procedure

rotate_secret() {
  local SECRET_NAME=$1
  local NEW_VALUE=$2
  
  # Add new version
  echo -n "$NEW_VALUE" | \
    gcloud secrets versions add "$SECRET_NAME" --data-file=-
  
  # List versions
  gcloud secrets versions list "$SECRET_NAME"
  
  # Disable old versions after deployment
  # gcloud secrets versions disable "$SECRET_NAME" --version=1
}

# Example: Rotate JWT secret
NEW_JWT_SECRET=$(openssl rand -base64 64)
rotate_secret "interspace-prod-jwt-secret" "$NEW_JWT_SECRET"

# Trigger service redeployment to pick up new secret
gcloud run services update interspace-backend-prod \
  --region=us-central1 \
  --update-env-vars="SECRET_ROTATED=$(date +%s)"
```

### 4.3 Secret Access Audit

```bash
# View secret access logs
gcloud logging read \
  'resource.type="secretmanager.googleapis.com/Secret"
   AND protoPayload.methodName="google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion"' \
  --limit=50 \
  --format=json | jq '.[] | {
    timestamp: .timestamp,
    secret: .protoPayload.request.name,
    caller: .protoPayload.authenticationInfo.principalEmail
  }'
```

## 5. MONITORING & ALERTING SETUP

### 5.1 Uptime Checks

```bash
# Create uptime check for production API
gcloud monitoring uptime-checks create \
  https \
  interspace-api-prod \
  --display-name="Interspace API Production" \
  --uri="https://api.interspace.fi/health" \
  --check-interval=60s
```

### 5.2 Alert Policies

```bash
# High error rate alert
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="High Error Rate - Production" \
  --condition-display-name="Error rate > 1%" \
  --condition-expression='
    resource.type = "cloud_run_revision"
    AND resource.labels.service_name = "interspace-backend-prod"
    AND metric.type = "run.googleapis.com/request_count"
    AND metric.labels.response_code_class != "2xx"
  ' \
  --condition-threshold-value=0.01 \
  --condition-threshold-duration=300s
```

### 5.3 Custom Metrics

```bash
# Create custom metric for wallet operations
gcloud logging metrics create wallet_operations \
  --description="Count of wallet operations" \
  --log-filter='
    resource.type="cloud_run_revision"
    jsonPayload.event="wallet_operation"
  ' \
  --value-extractor='EXTRACT(jsonPayload.operation_type)' \
  --metric-kind=DELTA \
  --value-type=INT64
```

### 5.4 Dashboard Creation

```yaml
# monitoring-dashboard.yaml
displayName: Interspace Platform Dashboard
mosaicLayout:
  columns: 12
  tiles:
  - width: 6
    height: 4
    widget:
      title: API Request Rate
      xyChart:
        dataSets:
        - timeSeriesQuery:
            timeSeriesFilter:
              filter: |
                resource.type = "cloud_run_revision"
                resource.labels.service_name = "interspace-backend-prod"
                metric.type = "run.googleapis.com/request_count"
        - plotType: LINE
  - width: 6
    height: 4
    xPos: 6
    widget:
      title: Error Rate
      xyChart:
        dataSets:
        - timeSeriesQuery:
            timeSeriesFilter:
              filter: |
                resource.type = "cloud_run_revision"
                resource.labels.service_name = "interspace-backend-prod"
                metric.type = "run.googleapis.com/request_count"
                metric.labels.response_code_class != "2xx"
```

```bash
# Create dashboard
gcloud monitoring dashboards create --config-from-file=monitoring-dashboard.yaml
```

## 6. OPERATIONAL RUNBOOKS

### 6.1 Service Restart

```bash
#!/bin/bash
# Service restart runbook

SERVICE_NAME=$1
ENVIRONMENT=$2

echo "Restarting $SERVICE_NAME-$ENVIRONMENT..."

# Get current revision
CURRENT_REVISION=$(gcloud run services describe $SERVICE_NAME-$ENVIRONMENT \
  --region=us-central1 \
  --format="value(status.traffic[0].revisionName)")

# Force new revision by updating environment variable
gcloud run services update $SERVICE_NAME-$ENVIRONMENT \
  --region=us-central1 \
  --update-env-vars="RESTART_TIME=$(date +%s)"

# Wait for rollout
gcloud run services wait $SERVICE_NAME-$ENVIRONMENT \
  --region=us-central1

echo "Service restarted successfully"
```

### 6.2 Database Connection Issues

```bash
#!/bin/bash
# Database troubleshooting runbook

echo "=== Database Connection Diagnostics ==="

# Check database status
for ENV in dev prod; do
  echo "Checking interspace-db-$ENV..."
  gcloud sql instances describe interspace-db-$ENV \
    --format="table(state,ipAddresses[0].ipAddress,backendType)"
done

# Test connectivity from Cloud Shell
gcloud sql connect interspace-db-dev --user=interspace_dev

# Check active connections
gcloud sql operations list \
  --instance=interspace-db-prod \
  --filter="status!=DONE" \
  --limit=10
```

### 6.3 High Memory Usage

```bash
#!/bin/bash
# Memory investigation runbook

SERVICE="interspace-backend-prod"

# Get memory metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/memory/utilizations"
           AND resource.labels.service_name="'$SERVICE'"' \
  --interval-end-time="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --interval-start-time="$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)"

# Scale up if needed
gcloud run services update $SERVICE \
  --region=us-central1 \
  --memory=4Gi

# Check for memory leaks in logs
gcloud logging read \
  "resource.type=\"cloud_run_revision\"
   AND resource.labels.service_name=\"$SERVICE\"
   AND (\"JavaScript heap out of memory\" OR \"OOM\")" \
  --limit=50
```

### 6.4 Traffic Rollback

```bash
#!/bin/bash
# Emergency traffic rollback

SERVICE="interspace-backend-prod"

# List recent revisions
gcloud run revisions list \
  --service=$SERVICE \
  --region=us-central1 \
  --limit=5

# Rollback to previous revision
PREVIOUS_REVISION="interspace-backend-prod-00123-abc"  # Replace with actual
gcloud run services update-traffic $SERVICE \
  --region=us-central1 \
  --to-revisions=$PREVIOUS_REVISION=100

echo "Traffic rolled back to $PREVIOUS_REVISION"
```

## 7. EMERGENCY PROCEDURES

### 7.1 Complete Service Outage

```bash
#!/bin/bash
# Emergency recovery procedure

echo "🚨 EMERGENCY RECOVERY INITIATED 🚨"

# 1. Check service status
for SERVICE in backend duo-node; do
  echo "Checking $SERVICE..."
  gcloud run services describe interspace-$SERVICE-prod \
    --region=us-central1 \
    --format="table(status.conditions[0].type,status.conditions[0].status)"
done

# 2. Check recent errors
gcloud logging read \
  "severity>=ERROR
   AND resource.type=\"cloud_run_revision\"
   AND timestamp>=\"$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=20

# 3. Force restart all services
for SERVICE in backend duo-node; do
  gcloud run services update interspace-$SERVICE-prod \
    --region=us-central1 \
    --update-env-vars="EMERGENCY_RESTART=$(date +%s)"
done

# 4. Verify recovery
sleep 30
for SERVICE in backend duo-node; do
  URL=$(gcloud run services describe interspace-$SERVICE-prod \
    --region=us-central1 \
    --format="value(status.url)")
  curl -f "$URL/health" && echo "✓ $SERVICE recovered" || echo "✗ $SERVICE still down"
done
```

### 7.2 Database Failover

```bash
#!/bin/bash
# Manual database failover

INSTANCE="interspace-db-prod"

# Initiate failover
gcloud sql instances failover $INSTANCE

# Monitor failover progress
while true; do
  STATE=$(gcloud sql instances describe $INSTANCE --format="value(state)")
  echo "Instance state: $STATE"
  if [ "$STATE" = "RUNNABLE" ]; then
    echo "Failover complete"
    break
  fi
  sleep 10
done

# Update application if needed
gcloud run services update interspace-backend-prod \
  --region=us-central1 \
  --update-env-vars="DB_FAILOVER_TIME=$(date +%s)"
```

### 7.3 Security Breach Response

```bash
#!/bin/bash
# Security incident response

echo "🔒 SECURITY INCIDENT RESPONSE 🔒"

# 1. Revoke all service account keys
for SA in $(gcloud iam service-accounts list --format="value(email)" | grep interspace); do
  echo "Revoking keys for $SA..."
  for KEY in $(gcloud iam service-accounts keys list --iam-account=$SA --format="value(name)"); do
    gcloud iam service-accounts keys delete $KEY --iam-account=$SA --quiet
  done
done

# 2. Rotate all secrets
for SECRET in $(gcloud secrets list --format="value(name)" | grep interspace); do
  echo "Rotating $SECRET..."
  NEW_VALUE=$(openssl rand -base64 64)
  echo -n "$NEW_VALUE" | gcloud secrets versions add $SECRET --data-file=-
done

# 3. Disable external access
gcloud run services update interspace-backend-prod \
  --region=us-central1 \
  --no-allow-unauthenticated

# 4. Enable additional logging
gcloud logging sinks create security-audit-sink \
  storage.googleapis.com/interspace-security-audit \
  --log-filter='severity>=WARNING'

echo "Initial response complete. Investigate logs and audit trail."
```

### 7.4 Disaster Recovery

```bash
#!/bin/bash
# Full disaster recovery procedure

echo "=== DISASTER RECOVERY PROCEDURE ==="

# 1. Restore database from backup
BACKUP_ID=$(gcloud sql backups list \
  --instance=interspace-db-prod \
  --limit=1 \
  --format="value(id)")

gcloud sql instances restore-backup interspace-db-prod \
  --backup-id=$BACKUP_ID

# 2. Restore Redis from snapshot (if available)
# Note: Basic tier doesn't support snapshots
# For production, implement Redis backup/restore

# 3. Rebuild and deploy all services
cd /path/to/interspace-backend
git checkout main
git pull
gcloud builds submit --config=cloudbuild.prod.yaml

cd /path/to/interspace-duo-node
git checkout main
git pull
gcloud builds submit --config=cloudbuild.prod.yaml

# 4. Verify all services
./scripts/post-deployment-verification.sh

echo "Disaster recovery complete"
```

## APPENDIX A: COMMON COMMANDS REFERENCE

```bash
# Service management
gcloud run services list --region=us-central1
gcloud run services describe SERVICE_NAME --region=us-central1
gcloud run services delete SERVICE_NAME --region=us-central1 --quiet
gcloud run services update SERVICE_NAME --region=us-central1 --TAG=VALUE

# Log viewing
gcloud run logs read --service=SERVICE_NAME --region=us-central1 --limit=100
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# Secret management
gcloud secrets list
gcloud secrets versions list SECRET_NAME
gcloud secrets versions access latest --secret=SECRET_NAME

# Database operations
gcloud sql instances list
gcloud sql databases list --instance=INSTANCE_NAME
gcloud sql operations list --instance=INSTANCE_NAME
gcloud sql backups list --instance=INSTANCE_NAME

# Monitoring
gcloud monitoring uptime-checks list
gcloud monitoring alert-policies list
gcloud monitoring dashboards list
```

## APPENDIX B: TROUBLESHOOTING MATRIX

| Issue | Diagnostic Command | Resolution |
|-------|-------------------|------------|
| Service won't start | `gcloud run logs read` | Check container logs for errors |
| Database connection failed | `gcloud sql instances describe` | Verify VPC connector and IP |
| High latency | `gcloud monitoring metrics list` | Scale up instances or optimize code |
| Secret access denied | `gcloud secrets get-iam-policy` | Check service account permissions |
| Build failures | `gcloud builds log BUILD_ID` | Review build logs for errors |

---

**END OF OPERATIONS MANUAL**

**For emergencies contact**: SRE On-Call  
**Escalation**: Engineering Lead → CTO  
**Review cycle**: Monthly