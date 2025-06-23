# Google Cloud Deployment Guide

## Prerequisites
- Google Cloud account with billing enabled
- `gcloud` CLI installed and authenticated
- Docker installed locally
- A PostgreSQL database (Cloud SQL or external)

## Quick Fix for Current Issue

The deployment is failing due to a rate limiter bug. Here's the immediate fix:

1. **Apply the rate limiter fix** (already done in the code)
2. **Set environment variables in Cloud Run**:
   ```bash
   gcloud run services update interspace-backend \
     --set-env-vars="REDIS_ENABLED=false,NODE_ENV=production"
   ```

## Complete Deployment Steps

### 1. Set up Environment Variables

Create a `.env.production` file based on `.env.production.example`:
```bash
cp .env.production.example .env.production
# Edit the file with your values
```

### 2. Build and Test Locally

```bash
# Build the Docker image
docker build -t interspace-backend:prod .

# Test locally
docker run -p 3000:3000 \
  --env-file .env.production \
  interspace-backend:prod
```

### 3. Deploy to Cloud Run

#### Option A: Using Cloud Build (Recommended)
```bash
# Submit build
gcloud builds submit --config cloudbuild.yaml
```

#### Option B: Manual Deployment
```bash
# Set your project ID
export PROJECT_ID=your-project-id

# Build and push image
docker build -t gcr.io/$PROJECT_ID/interspace-backend .
docker push gcr.io/$PROJECT_ID/interspace-backend

# Deploy to Cloud Run
gcloud run deploy interspace-backend \
  --image gcr.io/$PROJECT_ID/interspace-backend \
  --platform managed \
  --region us-central1 \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --port 3000 \
  --allow-unauthenticated
```

### 4. Set Environment Variables in Cloud Run

```bash
gcloud run services update interspace-backend \
  --region us-central1 \
  --set-env-vars="NODE_ENV=production,PORT=3000,REDIS_ENABLED=false" \
  --set-env-vars="DATABASE_URL=your-database-url" \
  --set-env-vars="JWT_SECRET=your-jwt-secret" \
  --set-env-vars="ENCRYPTION_SECRET=your-encryption-secret" \
  --set-env-vars="SILENCE_ADMIN_TOKEN=your-silence-token" \
  --set-env-vars="SILENCE_NODE_URL=your-silence-url"
```

### 5. Using Cloud SQL (Optional)

If using Cloud SQL for PostgreSQL:

```bash
# Enable Cloud SQL Admin API
gcloud services enable sqladmin.googleapis.com

# Update Cloud Run service to connect to Cloud SQL
gcloud run services update interspace-backend \
  --add-cloudsql-instances=PROJECT_ID:REGION:INSTANCE_NAME \
  --set-env-vars="DATABASE_URL=postgresql://user:pass@/dbname?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME"
```

### 6. Run Database Migrations

```bash
# Option 1: During deployment (add to env vars)
--set-env-vars="RUN_MIGRATIONS=true"

# Option 2: Manually via Cloud Shell
gcloud sql connect your-instance --user=postgres
# Then run migrations
```

## Troubleshooting

### Service Unavailable Error
1. Check logs: `gcloud run services logs read interspace-backend`
2. Verify all required environment variables are set
3. Ensure database is accessible
4. Check memory/CPU limits

### Common Issues
- **Rate Limiter Error**: Fixed in code, ensure REDIS_ENABLED=false initially
- **Database Connection**: Verify DATABASE_URL format and Cloud SQL proxy
- **Missing Dependencies**: Rebuild Docker image with latest package.json
- **Port Issues**: Ensure PORT=3000 is set and matches Dockerfile EXPOSE

### Debug Commands
```bash
# View service details
gcloud run services describe interspace-backend --region us-central1

# Stream logs
gcloud run services logs tail interspace-backend --region us-central1

# List revisions
gcloud run revisions list --service interspace-backend --region us-central1
```

## Production Checklist

- [ ] Set secure JWT_SECRET (min 32 chars)
- [ ] Set secure ENCRYPTION_SECRET (min 32 chars)
- [ ] Configure database with SSL
- [ ] Set up proper CORS origins
- [ ] Enable Cloud Armor for DDoS protection
- [ ] Set up Cloud Monitoring alerts
- [ ] Configure custom domain with SSL
- [ ] Set up CI/CD pipeline
- [ ] Enable container vulnerability scanning
- [ ] Configure backup strategy for database