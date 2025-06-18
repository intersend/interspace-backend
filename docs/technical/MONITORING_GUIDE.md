# Interspace Backend - Monitoring & Troubleshooting Guide

This guide provides comprehensive monitoring strategies and troubleshooting procedures for the Interspace Backend deployed on Google Cloud Run.

## 📊 Monitoring Overview

### Key Metrics to Monitor

#### Application Health
- **HTTP Response Times**: 95th percentile < 200ms
- **Error Rates**: < 0.1% for 5xx errors
- **Request Volume**: Track QPS and daily active users
- **Memory Usage**: Should stay below 80% of allocated
- **CPU Usage**: Should stay below 70% of allocated

#### Database Performance
- **Connection Pool**: Monitor active/idle connections
- **Query Performance**: Slow queries > 100ms
- **Database CPU**: Should stay below 80%
- **Storage Usage**: Monitor disk space growth

#### MPC Services
- **Key Generation Success Rate**: > 99.5%
- **Service Communication**: Response times < 500ms
- **Authentication Failures**: Monitor auth issues

## 🔍 Google Cloud Monitoring Setup

### Cloud Run Metrics

```bash
# View service metrics
gcloud monitoring metrics list --filter="metric.type:run.googleapis.com"

# Key metrics to track:
# - run.googleapis.com/request_count
# - run.googleapis.com/request_latencies
# - run.googleapis.com/billable_instance_time
# - run.googleapis.com/memory/peak_utilization
# - run.googleapis.com/cpu/utilizations
```

### Setting Up Alerts

```bash
# Create alert policy for high error rate
gcloud alpha monitoring policies create --policy-from-file=monitoring/error-rate-alert.yaml

# Create alert policy for high latency
gcloud alpha monitoring policies create --policy-from-file=monitoring/latency-alert.yaml

# Create alert policy for low availability
gcloud alpha monitoring policies create --policy-from-file=monitoring/availability-alert.yaml
```

### Custom Metrics

Add custom metrics to your application:

```typescript
// src/utils/metrics.ts
import { Gauge, Counter, Histogram } from 'prom-client';

export const metrics = {
  activeUsers: new Gauge({
    name: 'interspace_active_users',
    help: 'Number of active users'
  }),
  
  mpcOperations: new Counter({
    name: 'interspace_mpc_operations_total',
    help: 'Total MPC operations',
    labelNames: ['operation_type', 'status']
  }),
  
  databaseQueries: new Histogram({
    name: 'interspace_database_query_duration_seconds',
    help: 'Database query duration',
    labelNames: ['operation']
  })
};
```

## 📱 Health Check Endpoints

### Application Health Check

The application provides several health check endpoints:

```bash
# Basic health check
curl https://your-service-url.run.app/health

# Detailed health check with dependencies
curl https://your-service-url.run.app/health/detailed

# Database connectivity check
curl https://your-service-url.run.app/health/database

# MPC services check
curl https://your-service-url.run.app/health/mpc
```

### Expected Health Check Responses

```json
// GET /health
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "version": "1.0.0",
  "environment": "production"
}

// GET /health/detailed
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy", "responseTime": "45ms" },
    "mpc_services": { "status": "healthy", "responseTime": "120ms" },
    "memory": { "status": "healthy", "usage": "65%" },
    "cpu": { "status": "healthy", "usage": "45%" }
  }
}
```

## 🚨 Common Issues & Solutions

### Database Connection Issues

#### Issue: "Connection pool exhausted"
**Symptoms**: 500 errors, "Pool exhausted" in logs
**Solution**:
```bash
# Check database connections
gcloud sql operations list --instance=interspace-prod-db

# Scale up database if needed
gcloud sql instances patch interspace-prod-db --tier=db-g1-small

# Check application connection pool settings in config
```

#### Issue: "Database timeout"
**Symptoms**: Slow responses, timeouts in logs
**Solution**:
```sql
-- Check for long-running queries
SELECT query, state, age(now(), query_start) as duration
FROM pg_stat_activity 
WHERE state != 'idle' 
ORDER BY duration DESC;

-- Kill long-running queries if necessary
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = <problematic_pid>;
```

### Cloud Run Service Issues

#### Issue: "Service unavailable"
**Symptoms**: 503 errors, service not responding
**Solution**:
```bash
# Check service status
gcloud run services describe interspace-backend-prod --region=us-central1

# Check recent revisions
gcloud run revisions list --service=interspace-backend-prod --region=us-central1

# Rollback to previous revision if needed
gcloud run services update-traffic interspace-backend-prod \
  --to-revisions=REVISION_NAME=100 --region=us-central1
```

#### Issue: "Cold start latency"
**Symptoms**: Slow first requests after idle periods
**Solution**:
```bash
# Set minimum instances to avoid cold starts
gcloud run services update interspace-backend-prod \
  --min-instances=1 --region=us-central1

# Increase CPU allocation for faster startup
gcloud run services update interspace-backend-prod \
  --cpu=2 --region=us-central1
```

### MPC Service Communication Issues

#### Issue: "MPC service unreachable"
**Symptoms**: MPC operations failing, connection timeouts
**Solution**:
```bash
# Check VPC connector status
gcloud compute networks vpc-access connectors describe interspace-connector \
  --region=us-central1

# Test internal connectivity
gcloud run services proxy interspace-backend-prod --port=8080
# Then test: curl localhost:8080/health/mpc

# Check MPC service logs
gcloud logs read --filter="resource.type=cloud_run_revision AND resource.labels.service_name=interspace-silence-node-prod"
```

### Authentication Issues

#### Issue: "JWT token validation failed"
**Symptoms**: 401 errors, authentication failures
**Solution**:
```bash
# Check JWT secret in Secret Manager
gcloud secrets versions access latest --secret="interspace-prod-jwt-secret"

# Verify secret is being loaded correctly
gcloud logs read --filter="resource.type=cloud_run_revision" --format="table(timestamp,textPayload)" | grep -i jwt

# Test token generation
curl -X POST https://your-service-url.run.app/api/v1/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{"authStrategy": "test"}'
```

## 📋 Troubleshooting Playbook

### Step 1: Initial Assessment

```bash
# Check overall service health
curl https://your-service-url.run.app/health

# Check Cloud Run service status
gcloud run services list --region=us-central1

# Check recent error logs
gcloud logs read --filter="severity>=ERROR" --limit=20 --format="table(timestamp,severity,textPayload)"
```

### Step 2: Identify the Problem Area

| Symptom | Likely Cause | Investigation Steps |
|---------|--------------|-------------------|
| 5xx errors | Application crash | Check application logs |
| 4xx errors | Client/auth issues | Check authentication flow |
| Timeouts | Database/MPC issues | Check external dependencies |
| Memory issues | Resource constraints | Check resource usage |
| Cold starts | Scaling configuration | Check instance settings |

### Step 3: Deep Dive Investigation

#### For Application Issues:
```bash
# Get detailed logs
gcloud logs read --filter="resource.type=cloud_run_revision AND resource.labels.service_name=interspace-backend-prod" --limit=100

# Check specific error patterns
gcloud logs read --filter="severity=ERROR AND textPayload:'database'" --limit=20

# Check recent deployments
gcloud run revisions list --service=interspace-backend-prod --region=us-central1
```

#### For Database Issues:
```bash
# Check database status
gcloud sql instances describe interspace-prod-db

# Check database operations
gcloud sql operations list --instance=interspace-prod-db --limit=10

# Connect to database for investigation
gcloud sql connect interspace-prod-db --user=interspace_prod
```

#### For MPC Issues:
```bash
# Check MPC service status
gcloud run services describe interspace-silence-node-prod --region=us-central1

# Test internal connectivity
kubectl run test-pod --image=curlimages/curl --rm -it --restart=Never -- \
  curl https://interspace-silence-node-prod-PROJECT_NUMBER.us-central1.run.app/health
```

### Step 4: Resolution Actions

#### Immediate Actions:
1. **Scale up resources** if needed
2. **Rollback** to previous working revision
3. **Update secrets** if authentication issues
4. **Restart services** if connection issues

#### Follow-up Actions:
1. **Update monitoring** to catch similar issues
2. **Document incident** for future reference
3. **Review and improve** error handling
4. **Test incident response** procedures

## 📈 Performance Optimization

### Database Optimization

```sql
-- Check query performance
SELECT query, calls, total_time, mean_time, max_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- Check index usage
SELECT indexrelname, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_tup_read DESC;

-- Analyze table statistics
ANALYZE;
```

### Application Performance

```typescript
// Add request tracing
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Add performance monitoring
const performanceMiddleware = (req, res, next) => {
  const hrTime = process.hrtime();
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(hrTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;
    metrics.requestDuration.observe({ method: req.method, route: req.route?.path }, duration);
  });
  next();
};
```

## 🛠️ Useful Commands Reference

### Logging Commands
```bash
# Real-time logs
gcloud logs tail --filter="resource.type=cloud_run_revision"

# Error logs only
gcloud logs read --filter="severity>=ERROR" --limit=50

# Logs for specific service
gcloud logs read --filter="resource.labels.service_name=interspace-backend-prod"

# Logs with specific text
gcloud logs read --filter="textPayload:'MPC operation failed'"
```

### Service Management
```bash
# Update service configuration
gcloud run services update interspace-backend-prod \
  --memory=2Gi --cpu=2 --region=us-central1

# Deploy new revision
gcloud run deploy interspace-backend-prod \
  --image=gcr.io/PROJECT_ID/interspace-backend-prod:latest \
  --region=us-central1

# Set traffic split
gcloud run services update-traffic interspace-backend-prod \
  --to-revisions=REVISION1=50,REVISION2=50 --region=us-central1
```

### Database Management
```bash
# Create backup
gcloud sql backups create --instance=interspace-prod-db

# List backups
gcloud sql backups list --instance=interspace-prod-db

# Restore from backup
gcloud sql backups restore BACKUP_ID --restore-instance=interspace-prod-db
```

## 📞 Escalation Procedures

### Severity Levels

#### P0 - Critical (Service Down)
- **Response Time**: Immediate
- **Escalation**: DevOps Lead + Engineering Manager
- **Actions**: Immediate rollback, all-hands debugging

#### P1 - High (Degraded Performance)
- **Response Time**: 15 minutes
- **Escalation**: DevOps Lead
- **Actions**: Investigate and mitigate within 1 hour

#### P2 - Medium (Minor Issues)
- **Response Time**: 1 hour
- **Escalation**: Engineering team
- **Actions**: Fix within business hours

#### P3 - Low (Enhancement/Monitoring)
- **Response Time**: Next business day
- **Escalation**: Product team
- **Actions**: Schedule for next sprint

### Contact Information
- **DevOps Lead**: [Contact Info]
- **Backend Lead**: [Contact Info]
- **Database Admin**: [Contact Info]
- **Security Team**: [Contact Info]

### Communication Channels
- **Slack**: #interspace-incidents
- **Email**: engineering@interspace.com
- **Phone**: Emergency on-call rotation

---

*This document should be updated regularly based on operational experience and new monitoring insights.*