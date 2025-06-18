# Deployment Summary - Interspace Platform

## Infrastructure Created

### Project Information
- **Project ID**: intersend
- **Project Number**: 784862970473
- **Region**: us-central1

### Network Infrastructure
- **VPC**: interspace-vpc
- **Subnet**: interspace-subnet (10.0.0.0/20)
- **VPC Connector**: interspace-connector (10.8.0.16/28)

### Databases (Cloud SQL PostgreSQL)
1. **Development Database**
   - Instance: interspace-db-dev
   - IP: 10.136.0.3
   - Database: interspace_dev
   - User: interspace_dev
   - Tier: db-g1-small

2. **Production Database**
   - Instance: interspace-db-prod
   - IP: 10.136.0.4
   - Database: interspace_prod
   - User: interspace_prod
   - Tier: db-custom-2-8192 (HA enabled)

### Redis (Memorystore)
1. **Development Redis**
   - Instance: interspace-redis-dev
   - IP: 10.122.22.251:6379
   - Tier: basic

2. **Production Redis**
   - Instance: interspace-redis-prod
   - IP: 10.124.225.156:6379
   - Tier: standard (HA enabled)

### Service Accounts Created
- interspace-backend-dev@intersend.iam.gserviceaccount.com
- interspace-backend-prod@intersend.iam.gserviceaccount.com
- interspace-duo-dev@intersend.iam.gserviceaccount.com
- interspace-duo-prod@intersend.iam.gserviceaccount.com

### Secrets Created
All secrets are stored in Google Secret Manager:
- Database URLs (dev & prod)
- JWT secrets (separate for dev & prod)
- Encryption secrets (separate for dev & prod)
- OAuth credentials (Google & Apple)
- Orby API keys
- SendGrid API key
- Monitoring webhooks (placeholders)
- Silence Labs token (placeholder)

### Artifact Registry
- Repository: us-central1-docker.pkg.dev/intersend/interspace-docker

## Next Steps to Deploy Services

### 1. Deploy Duo Node (Private Service)

First, you need to deploy the Silence Duo Server (required dependency):
```bash
# Contact Silence Labs for deployment package
# Deploy silence-duo-server-dev and silence-duo-server-prod
```

Then deploy the duo node:
```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-duo-node

# Deploy development
gcloud builds submit --config=cloudbuild.dev.yaml

# Deploy production
gcloud builds submit --config=cloudbuild.prod.yaml
```

### 2. Configure Duo Node Access
After deployment, make the duo node services private:
```bash
# Remove public access
gcloud run services update interspace-duo-node-dev --no-allow-unauthenticated --region=us-central1
gcloud run services update interspace-duo-node-prod --no-allow-unauthenticated --region=us-central1

# Grant backend access to duo-node
gcloud run services add-iam-policy-binding interspace-duo-node-dev \
  --member="serviceAccount:interspace-backend-dev@intersend.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=us-central1

gcloud run services add-iam-policy-binding interspace-duo-node-prod \
  --member="serviceAccount:interspace-backend-prod@intersend.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=us-central1
```

### 3. Deploy Backend (Public Service)

```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-backend

# Create database migration job first (optional)
gcloud run jobs create interspace-db-migrate-dev \
  --image=us-central1-docker.pkg.dev/intersend/interspace-docker/interspace-backend-dev:latest \
  --region=us-central1 \
  --set-env-vars="NODE_ENV=development" \
  --set-secrets="DATABASE_URL=interspace-dev-database-url:latest" \
  --vpc-connector=projects/intersend/locations/us-central1/connectors/interspace-connector \
  --vpc-egress=private-ranges-only \
  --service-account=interspace-backend-dev@intersend.iam.gserviceaccount.com \
  --command="npm" \
  --args="run,prisma:migrate:deploy"

# Deploy development
gcloud builds submit --config=cloudbuild.dev.yaml

# Deploy production
gcloud builds submit --config=cloudbuild.prod.yaml
```

### 4. Update Backend with Duo Node URLs
After duo-node is deployed:
```bash
# Get duo-node URLs
DUO_NODE_DEV_URL=$(gcloud run services describe interspace-duo-node-dev --region=us-central1 --format="value(status.url)")
DUO_NODE_PROD_URL=$(gcloud run services describe interspace-duo-node-prod --region=us-central1 --format="value(status.url)")

# Update backend services
gcloud run services update interspace-backend-dev \
  --update-env-vars="DUO_NODE_URL=$DUO_NODE_DEV_URL,DUO_NODE_AUDIENCE_URL=$DUO_NODE_DEV_URL" \
  --region=us-central1

gcloud run services update interspace-backend-prod \
  --update-env-vars="DUO_NODE_URL=$DUO_NODE_PROD_URL,DUO_NODE_AUDIENCE_URL=$DUO_NODE_PROD_URL" \
  --region=us-central1
```

### 5. Domain Mapping (Production)
```bash
gcloud run domain-mappings create \
  --service=interspace-backend-prod \
  --domain=api.interspace.fi \
  --region=us-central1
```

### 6. Test Endpoints
```bash
# Development
DEV_URL=$(gcloud run services describe interspace-backend-dev --region=us-central1 --format="value(status.url)")
curl "$DEV_URL/health"

# Production (after domain mapping)
curl "https://api.interspace.fi/health"
```

## Important Notes

1. **Silence Labs Token**: Currently using placeholder. Update the secret when you have the actual token:
   ```bash
   echo -n "ACTUAL_TOKEN" | gcloud secrets versions add interspace-silence-admin-token --data-file=-
   ```

2. **Monitoring Webhooks**: Update the Slack/Discord/PagerDuty webhooks when ready:
   ```bash
   echo -n "https://hooks.slack.com/services/YOUR/ACTUAL/WEBHOOK" | \
     gcloud secrets versions add interspace-prod-slack-webhook --data-file=-
   ```

3. **iOS App CORS**: The production CORS settings include:
   - https://app.interspace.fi
   - https://interspace.fi
   - capacitor://localhost
   - ionic://localhost

4. **Security**: 
   - Duo-node is only accessible via VPC (no public access)
   - All secrets are in Secret Manager
   - Service accounts have minimal permissions
   - Databases have no public IPs

## Troubleshooting

If you encounter issues:
1. Check logs: `gcloud run logs read --service=SERVICE_NAME --region=us-central1`
2. Check service status: `gcloud run services describe SERVICE_NAME --region=us-central1`
3. Verify VPC connector: `gcloud compute networks vpc-access connectors describe interspace-connector --region=us-central1`
4. Test database connectivity from Cloud Shell with Cloud SQL Proxy