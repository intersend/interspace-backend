# DEPLOYMENT CHECKLIST - INTERSPACE PLATFORM
**Version**: 1.0.0  
**Type**: Operational Checklist  
**Usage**: Execute sequentially for each deployment

## 1. PRE-DEPLOYMENT VERIFICATION

### 1.1 Code Quality Checks
- [ ] All tests passing (`npm test`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] Security audit clean (`npm audit`)
- [ ] No console.log statements in production code
- [ ] Environment variables documented

### 1.2 Security Verification
- [ ] No hardcoded secrets in code
- [ ] All API endpoints have authentication
- [ ] Rate limiting configured
- [ ] CORS settings appropriate for environment
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified

### 1.3 Infrastructure Validation
- [ ] VPC connector status: READY
- [ ] Database instances: RUNNABLE
- [ ] Redis instances: READY
- [ ] All service accounts created
- [ ] IAM permissions verified
- [ ] Secrets exist in Secret Manager

### 1.4 Configuration Review
- [ ] Cloud Build files have correct project ID/number
- [ ] Environment variables match deployment target
- [ ] JWT expiration times correct (15m access, 7d refresh)
- [ ] Database connection strings use private IPs
- [ ] Redis URLs configured correctly
- [ ] Third-party service URLs correct

## 2. DEPLOYMENT EXECUTION

### 2.1 Development Deployment
- [ ] Switch to development branch
- [ ] Pull latest changes
- [ ] Run pre-deployment validation script
- [ ] Execute: `gcloud builds submit --config=cloudbuild.dev.yaml`
- [ ] Monitor Cloud Build logs
- [ ] Verify build completion
- [ ] Check service status in Cloud Run

### 2.2 Database Migration (if needed)
- [ ] Review migration files
- [ ] Backup database before migration
- [ ] Execute migration job
- [ ] Verify migration success
- [ ] Test database connectivity

### 2.3 Production Deployment
- [ ] Create release tag: `git tag -a v1.x.x -m "Release notes"`
- [ ] Push tag: `git push origin v1.x.x`
- [ ] Create release notes documenting changes
- [ ] Get approval from tech lead
- [ ] Execute: `gcloud builds submit --config=cloudbuild.prod.yaml`
- [ ] Monitor gradual traffic rollout (0% → 10% → 50% → 100%)
- [ ] Watch error rates during rollout
- [ ] Be ready to rollback if needed

## 3. POST-DEPLOYMENT VALIDATION

### 3.1 Service Health Checks
- [ ] Backend health endpoint returns 200
- [ ] API version endpoint accessible
- [ ] Database connectivity verified
- [ ] Redis connectivity verified
- [ ] Duo node accessible from backend
- [ ] All environment variables loaded

### 3.2 Functional Testing
- [ ] Authentication flow works
- [ ] User registration successful
- [ ] MPC operations functional
- [ ] Email delivery working
- [ ] Rate limiting active
- [ ] CORS headers correct

### 3.3 Performance Validation
- [ ] Response time < 200ms (p95)
- [ ] CPU usage < 70%
- [ ] Memory usage < 80%
- [ ] No memory leaks detected
- [ ] Database connection pool healthy
- [ ] No excessive error logs

### 3.4 Security Validation
- [ ] Duo node not publicly accessible
- [ ] Database has no public IP
- [ ] All secrets properly loaded
- [ ] Service accounts have minimal permissions
- [ ] No sensitive data in logs
- [ ] Security headers present

## 4. MONITORING SETUP

### 4.1 Alerts Configuration
- [ ] Uptime checks created
- [ ] Error rate alerts configured
- [ ] CPU/Memory alerts set
- [ ] Database connection alerts active
- [ ] Custom metrics defined
- [ ] Alert channels configured (Slack/PagerDuty)

### 4.2 Dashboard Verification
- [ ] Request rate graph visible
- [ ] Error rate graph configured
- [ ] Latency percentiles displayed
- [ ] Resource utilization shown
- [ ] Database metrics available
- [ ] Redis metrics visible

## 5. ROLLBACK PROCEDURES

### 5.1 Preparation
- [ ] Previous revision identified
- [ ] Rollback commands ready
- [ ] Team notified of potential rollback
- [ ] Monitoring dashboard open
- [ ] Incident channel created

### 5.2 Rollback Decision Criteria
- [ ] Error rate > 5%
- [ ] Response time > 1s (p95)
- [ ] Critical functionality broken
- [ ] Security vulnerability detected
- [ ] Database corruption

### 5.3 Rollback Execution
```bash
# Quick rollback to previous revision
gcloud run services update-traffic SERVICE_NAME \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

## 6. DOCUMENTATION UPDATES

### 6.1 Required Updates
- [ ] API documentation updated
- [ ] Changelog updated
- [ ] Release notes published
- [ ] Known issues documented
- [ ] Runbooks updated
- [ ] Architecture diagrams current

### 6.2 Communication
- [ ] Deployment announcement sent
- [ ] Stakeholders notified
- [ ] Support team briefed
- [ ] Monitoring team alerted
- [ ] On-call schedule confirmed

## 7. EMERGENCY CONTACTS

### 7.1 Escalation Path
1. **Level 1**: On-call Engineer
2. **Level 2**: Tech Lead
3. **Level 3**: CTO
4. **Level 4**: CEO (critical outages only)

### 7.2 External Contacts
- **Google Cloud Support**: [Support Case]
- **SendGrid Support**: [Ticket System]
- **Silence Labs**: [Contact]
- **Security Team**: [Incident Response]

## 8. SIGN-OFF

### 8.1 Deployment Approval
- [ ] Tech Lead approval: ___________
- [ ] Security review passed: ___________
- [ ] QA sign-off: ___________
- [ ] Product owner notified: ___________

### 8.2 Deployment Record
- **Date**: ___________
- **Version**: ___________
- **Deployed by**: ___________
- **Duration**: ___________
- **Issues encountered**: ___________
- **Rollback required**: Yes / No

## APPENDIX A: QUICK COMMANDS

```bash
# View service status
gcloud run services describe interspace-backend-prod --region=us-central1

# Check recent logs
gcloud run logs read --service=interspace-backend-prod --limit=100

# Emergency restart
gcloud run services update interspace-backend-prod \
  --region=us-central1 \
  --update-env-vars="RESTART=$(date +%s)"

# Database backup
gcloud sql backups create --instance=interspace-db-prod
```

## APPENDIX B: VALIDATION SCRIPTS

```bash
#!/bin/bash
# Health check all services
for SERVICE in backend duo-node; do
  for ENV in dev prod; do
    URL=$(gcloud run services describe interspace-$SERVICE-$ENV \
      --region=us-central1 --format="value(status.url)")
    curl -f "$URL/health" && echo "✓ $SERVICE-$ENV" || echo "✗ $SERVICE-$ENV"
  done
done
```

---

**Document Status**: ACTIVE  
**Review Frequency**: Before each deployment  
**Last Review**: 2025-06-18  
**Next Review**: Next deployment