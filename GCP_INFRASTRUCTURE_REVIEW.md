# Google Cloud Infrastructure Review - Intersend Project

**Date**: June 24, 2025  
**Project ID**: intersend  
**Project Number**: 784862970473

## Current Infrastructure Status

### ✅ APIs Enabled
- Cloud Build API
- Redis API (Memorystore)
- Secret Manager API
- VPC Access API
- **Missing**: Cloud Run API, Cloud SQL Admin API

### 🌐 Networking
- **VPC**: `interspace-vpc`
- **VPC Connector**: `interspace-connector` (READY)
  - Region: us-central1
  - IP Range: 10.8.0.16/28
  - Throughput: 200-300 Mbps

### 🗄️ Databases
- **Cloud SQL**:
  - `interspace-db-dev` (PostgreSQL 15, RUNNABLE)
    - Private IP: 10.136.0.3
    - Tier: db-g1-small
  - **Missing**: `interspace-db-prod`

- **Redis**:
  - No Memorystore Redis instances found
  - Using Cloud Run service `interspace-redis` as alternative

### 🚀 Cloud Run Services (us-central1)
1. **interspace-backend-dev**
   - URL: https://interspace-backend-dev-784862970473.us-central1.run.app
   - Last deployed: June 24, 2025

2. **interspace-duo-node-dev**
   - URL: https://interspace-duo-node-dev-784862970473.us-central1.run.app
   - Last deployed: June 24, 2025

3. **silence-labs-duo-server-dev**
   - URL: https://silence-labs-duo-server-dev-784862970473.us-central1.run.app
   - Last deployed: June 24, 2025

4. **interspace-redis** (Redis alternative)
   - URL: https://interspace-redis-784862970473.us-central1.run.app
   - Last deployed: June 19, 2025

**Missing**: Production services (`-prod` suffix)

### 🔐 Secret Manager
Secrets are properly configured with both dev and prod versions:

#### Development Secrets ✅
- interspace-dev-database-url
- interspace-dev-redis-url
- interspace-dev-sendgrid-key
- interspace-dev-slack-webhook

#### Production Secrets ✅
- interspace-prod-database-url
- interspace-prod-redis-url
- interspace-prod-sendgrid-key
- interspace-prod-discord-webhook
- interspace-prod-silence-admin-token
- interspace-prod-jwt-secret
- interspace-prod-jwt-refresh-secret
- interspace-prod-encryption-secret

#### Shared Secrets ✅
- interspace-jwt-secret
- interspace-jwt-refresh-secret
- interspace-encryption-secret
- interspace-google-client-id
- interspace-apple-client-id
- interspace-orby-private-key
- interspace-orby-public-key

## 🚨 Infrastructure Gaps for Production

### 1. **Missing Production Database**
- Need to create `interspace-db-prod` Cloud SQL instance
- Recommended: PostgreSQL 15, db-n1-standard-1 for production

### 2. **Missing Production Redis**
- Consider creating Memorystore Redis instance for production
- Or continue using Cloud Run Redis service

### 3. **Missing Production Cloud Run Services**
- Need to deploy:
  - `interspace-backend-prod`
  - `interspace-duo-node-prod`
  - `silence-labs-duo-server-prod`

### 4. **Enable Required APIs**
```bash
gcloud services enable cloudrun.googleapis.com sqladmin.googleapis.com
```

## 📋 Pre-Production Checklist

### Infrastructure Setup
- [ ] Enable Cloud Run and Cloud SQL Admin APIs
- [ ] Create production Cloud SQL instance
- [ ] Create production Redis instance (optional)
- [ ] Verify all secrets have valid values

### Deployment Preparation
- [ ] Update production database URL in secrets
- [ ] Configure production Redis URL
- [ ] Verify SendGrid API key is set
- [ ] Set production-specific JWT secrets

### Network Configuration
- [ ] VPC connector is ready ✅
- [ ] Private IP connectivity verified
- [ ] Firewall rules configured

## 🎯 Deployment Strategy

Since we're deploying to TestFlight, we have two options:

### Option 1: Use Development Infrastructure
- Pros: Already set up and running
- Cons: Not true production environment
- URL: https://interspace-backend-dev-784862970473.us-central1.run.app

### Option 2: Create Production Infrastructure
- Pros: Proper production setup
- Cons: Requires additional setup time
- Steps:
  1. Create production database
  2. Deploy production services
  3. Update iOS app with production URLs

## 🔒 Security Review

### Positive Findings
- Secrets properly stored in Secret Manager
- Private IP networking configured
- Separate dev/prod secrets

### Recommendations
- Ensure production secrets are different from dev
- Enable Cloud Armor for DDoS protection
- Set up Cloud IAM policies for least privilege
- Enable audit logging

## 📊 Cost Considerations

Current monthly estimate:
- Cloud SQL (dev): ~$50/month
- Cloud Run: ~$10-50/month (based on traffic)
- VPC Connector: ~$36/month
- Total: ~$100-150/month

Production additions:
- Cloud SQL (prod): ~$100-200/month
- Additional Cloud Run services: ~$20-100/month
- Redis (optional): ~$50-100/month

## Next Steps

1. **For TestFlight with Dev Infrastructure**:
   ```bash
   # iOS app should use:
   API_BASE_URL_RELEASE = https://interspace-backend-dev-784862970473.us-central1.run.app/api/v2
   ```

2. **For TestFlight with Prod Infrastructure**:
   ```bash
   # Create production database
   gcloud sql instances create interspace-db-prod \
     --database-version=POSTGRES_15 \
     --tier=db-n1-standard-1 \
     --region=us-central1 \
     --network=projects/intersend/global/networks/interspace-vpc \
     --no-assign-ip

   # Deploy production backend
   ./scripts/testflight-deploy.sh
   ```

## Recommendation

For TestFlight, I recommend using the existing development infrastructure since:
1. It's already running and tested
2. TestFlight is for beta testing, not production users
3. You can create production infrastructure later

Simply update the iOS app to point to the dev backend URL.