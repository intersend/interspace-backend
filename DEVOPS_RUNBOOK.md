# Interspace DevOps Runbook

## Overview

This runbook provides comprehensive procedures for deploying, monitoring, and maintaining the Interspace platform for TestFlight and production environments.

## Table of Contents

1. [Pre-deployment Checklist](#pre-deployment-checklist)
2. [Backend Deployment](#backend-deployment)
3. [iOS App Deployment](#ios-app-deployment)
4. [Monitoring & Alerts](#monitoring--alerts)
5. [Emergency Procedures](#emergency-procedures)
6. [Troubleshooting](#troubleshooting)

## Pre-deployment Checklist

### 1. Run Pre-deployment Validation

```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-backend
./scripts/pre-deployment-check.sh
```

This script validates:
- ✅ Google Cloud project configuration
- ✅ OAuth setup
- ✅ Infrastructure components (Cloud SQL, Redis, VPC)
- ✅ Secret Manager configuration
- ✅ Environment variables
- ✅ Code quality (tests, linting, type checking)
- ✅ Docker build
- ✅ iOS configuration

### 2. Manual Checks

#### Google Cloud Console
1. **OAuth Consent Screen**
   - URL: https://console.cloud.google.com/apis/credentials/consent
   - Verify app name, support email, privacy policy
   - Check publishing status

2. **OAuth Credentials**
   - iOS Client ID: `784862970473-ihme8p5f3psknnorplhero2108rk12sf.apps.googleusercontent.com`
   - Bundle ID restriction: `com.interspace.ios`
   - Web client for backend validation

3. **API Quotas**
   - Check quotas for Cloud Run, Cloud SQL, OAuth
   - No rate limit warnings

#### Backend Configuration
1. **Environment Variables**
   ```bash
   # Verify .env file
   EMAIL_SERVICE=sendgrid
   SENDGRID_API_KEY=<actual-key>
   NODE_ENV=production
   JWT_EXPIRES_IN=7d
   ```

2. **Database**
   - Recent backup exists
   - Migrations tested in staging
   - Connection pool configured

#### iOS Configuration
1. **BuildConfiguration.xcconfig**
   - No placeholder values
   - Production API URL set
   - All credentials configured

2. **Version Numbers**
   - Marketing version appropriate
   - Build number incremented

## Backend Deployment

### Automated Deployment

Run the comprehensive deployment script:

```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-backend
./scripts/testflight-deploy.sh
```

This script:
1. Runs pre-deployment checks
2. Backs up production database
3. Builds and pushes Docker image
4. Runs database migrations
5. Deploys with traffic control
6. Verifies deployment
7. Updates iOS configuration

### Manual Deployment Steps

If automated deployment fails, follow these steps:

#### 1. Database Backup
```bash
gcloud sql backups create \
  --instance=interspace-db-prod \
  --description="Manual backup $(date +%Y%m%d-%H%M%S)"
```

#### 2. Build Docker Image
```bash
docker build -t gcr.io/intersend/interspace-backend:latest .
docker push gcr.io/intersend/interspace-backend:latest
```

#### 3. Run Migrations
```bash
gcloud run jobs execute interspace-db-migrate-prod \
  --region=us-central1 \
  --wait
```

#### 4. Deploy to Cloud Run
```bash
# Deploy without traffic
gcloud run deploy interspace-backend-prod \
  --image=gcr.io/intersend/interspace-backend:latest \
  --region=us-central1 \
  --no-traffic

# Get new revision
NEW_REVISION=$(gcloud run services describe interspace-backend-prod \
  --region=us-central1 \
  --format="value(status.latestCreatedRevisionName)")

# Gradual rollout
gcloud run services update-traffic interspace-backend-prod \
  --region=us-central1 \
  --to-revisions="$NEW_REVISION=10"

# Monitor, then increase
gcloud run services update-traffic interspace-backend-prod \
  --region=us-central1 \
  --to-revisions="$NEW_REVISION=100"
```

#### 5. Verify Deployment
```bash
# Check health
curl https://interspace-backend-prod-784862970473.uc.r.appspot.com/health

# Check detailed health
curl https://interspace-backend-prod-784862970473.uc.r.appspot.com/health/detailed
```

## iOS App Deployment

### 1. Prepare for TestFlight

```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-ios
./scripts/prepare-testflight.sh
```

This script:
- Validates configuration
- Increments build number
- Checks for dev artifacts
- Creates submission checklist
- Generates test notes

### 2. Build and Archive

1. Open `Interspace.xcodeproj` in Xcode
2. Select "Any iOS Device" as destination
3. Product → Archive
4. Wait for archive completion

### 3. Upload to TestFlight

1. In Organizer, click "Distribute App"
2. Select "TestFlight & App Store"
3. Use automatic signing
4. Upload and wait for processing

### 4. Configure TestFlight

1. Go to App Store Connect
2. Select your app → TestFlight
3. Add build to test group
4. Fill in test information:
   - What to Test (use generated notes)
   - Test credentials if needed
5. Submit for beta review

### 5. Post-submission

- Monitor processing status
- Wait for beta review (usually < 24 hours)
- Send invites to testers
- Monitor crash reports and feedback

## Monitoring & Alerts

### Setup Monitoring

```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-backend
./scripts/setup-monitoring.sh alerts@interspace.fi
```

This creates:
- Uptime checks
- Error rate alerts (> 5%)
- Latency alerts (> 2s p95)
- Memory usage alerts (> 90%)
- Custom dashboard

### Monitoring URLs

- **Cloud Console**: https://console.cloud.google.com/home/dashboard?project=intersend
- **Cloud Run Metrics**: https://console.cloud.google.com/run/detail/us-central1/interspace-backend-prod/metrics?project=intersend
- **Logs**: https://console.cloud.google.com/logs/query?project=intersend
- **Monitoring Dashboard**: https://console.cloud.google.com/monitoring?project=intersend

### Key Metrics to Monitor

1. **Request Rate** - Normal: 100-1000 req/min
2. **Error Rate** - Target: < 1%
3. **Latency p95** - Target: < 500ms
4. **Memory Usage** - Target: < 70%
5. **Database Connections** - Target: < 80% of max

### Alert Response

When you receive an alert:

1. **High Error Rate**
   - Check logs for error patterns
   - Verify external services (SendGrid, OAuth)
   - Check database connectivity
   - Consider rollback if > 10%

2. **High Latency**
   - Check Cloud Run instances
   - Verify database performance
   - Check for memory pressure
   - Scale up if needed

3. **Database Issues**
   - Check Cloud SQL dashboard
   - Verify connection pool
   - Check for long-running queries
   - Restart if necessary

## Emergency Procedures

### Quick Rollback

```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-backend
./scripts/emergency-rollback.sh
```

Options:
1. View current traffic
2. List revisions
3. Rollback to previous
4. Rollback to specific revision

### Manual Rollback

```bash
# Get previous revision
PREVIOUS=$(gcloud run revisions list \
  --service=interspace-backend-prod \
  --region=us-central1 \
  --format="value(metadata.name)" \
  --limit=2 | tail -1)

# Rollback traffic
gcloud run services update-traffic interspace-backend-prod \
  --region=us-central1 \
  --to-revisions="$PREVIOUS=100"
```

### Database Rollback

```bash
# List backups
gcloud sql backups list --instance=interspace-db-prod

# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --restore-instance=interspace-db-prod
```

### Emergency Contacts

- **On-call Engineer**: [Your phone/email]
- **Google Cloud Support**: [Support ticket URL]
- **SendGrid Support**: [Support contact]

## Troubleshooting

### Common Issues

#### 1. Email Not Sending
- Check SendGrid API key in Secret Manager
- Verify FROM_EMAIL domain is verified
- Check SendGrid dashboard for blocks
- Review email service logs

#### 2. OAuth Login Failing
- Verify OAuth consent screen published
- Check client IDs match
- Verify redirect URIs
- Check Google API quotas

#### 3. Database Connection Errors
- Check Cloud SQL is running
- Verify VPC connector
- Check connection pool limits
- Review database logs

#### 4. High Memory Usage
- Check for memory leaks
- Review connection pooling
- Scale Cloud Run instances
- Optimize queries

#### 5. iOS App Crashes
- Check TestFlight crash reports
- Verify API compatibility
- Check network error handling
- Review device logs

### Debugging Commands

```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=interspace-backend-prod" \
  --limit=50 --format=json

# Stream logs
gcloud alpha run services logs tail interspace-backend-prod \
  --region=us-central1

# Check service status
gcloud run services describe interspace-backend-prod \
  --region=us-central1

# Database connections
gcloud sql operations list --instance=interspace-db-prod

# View metrics
gcloud monitoring time-series list \
  --filter='metric.type=~"run.googleapis.com.*" AND \
  resource.labels.service_name="interspace-backend-prod"'
```

### Performance Optimization

1. **Enable Cloud CDN** for static assets
2. **Optimize database queries** with indexes
3. **Implement caching** with Redis
4. **Use connection pooling** effectively
5. **Enable HTTP/2** on Cloud Run

## Maintenance Tasks

### Weekly
- Review error logs
- Check resource usage trends
- Update dependencies (security patches)
- Review user feedback

### Monthly
- Full backup verification
- Security audit
- Performance review
- Cost optimization review

### Quarterly
- Disaster recovery drill
- Security penetration testing
- Architecture review
- Capacity planning

## Security Checklist

- [ ] All secrets in Secret Manager
- [ ] No hardcoded credentials
- [ ] HTTPS only
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Security headers enabled
- [ ] Regular dependency updates
- [ ] Audit logs enabled

## References

- [Google Cloud Run Docs](https://cloud.google.com/run/docs)
- [Cloud SQL Best Practices](https://cloud.google.com/sql/docs/postgres/best-practices)
- [TestFlight Documentation](https://developer.apple.com/testflight/)
- [SendGrid API Docs](https://docs.sendgrid.com/)

---

**Last Updated**: $(date)
**Version**: 1.0.0