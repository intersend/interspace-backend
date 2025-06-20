# Git Push & Deployment Guidelines

**Version**: 1.0.0  
**Last Updated**: 2025-01-20  
**Purpose**: Comprehensive guide for git operations and deployment procedures  
**Audience**: Development team, DevOps, and AI agents

## Table of Contents

1. [Repository Overview](#1-repository-overview)
2. [Git Workflow](#2-git-workflow)
3. [Pre-Push Checklist](#3-pre-push-checklist)
4. [Deployment Pipeline](#4-deployment-pipeline)
5. [Environment Configuration](#5-environment-configuration)
6. [Service Dependencies](#6-service-dependencies)
7. [Monitoring & Rollback](#7-monitoring--rollback)
8. [Emergency Procedures](#8-emergency-procedures)

---

## 1. Repository Overview

### 1.1 Repository Structure

```
GitHub Organization: intersend
├── interspace-backend (Main API Service)
│   ├── URL: https://github.com/intersend/interspace-backend.git
│   ├── Primary Language: TypeScript
│   ├── Framework: Express.js
│   └── Database: PostgreSQL + Prisma ORM
│
└── interspace-duo-node (MPC Proxy Service)
    ├── URL: https://github.com/intersend/interspace-duo-node.git
    ├── Primary Language: TypeScript
    ├── Framework: Express.js
    └── Purpose: Authenticated proxy to Silence Labs Duo Server
```

### 1.2 Service Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌──────────────────┐
│ Client Apps     │  HTTPS  │ Backend API     │  HTTPS  │ Duo Node         │
│ (iOS/Web)       ├────────►│ (Public)        ├────────►│ (Internal VPC)   │
└─────────────────┘         └────────┬────────┘         └────────┬─────────┘
                                     │                            │
                            ┌────────▼────────┐         ┌────────▼─────────┐
                            │ Cloud SQL       │         │ Silence Duo      │
                            │ PostgreSQL      │         │ MPC Server       │
                            └─────────────────┘         └──────────────────┘
```

### 1.3 Infrastructure Details

- **Project ID**: intersend
- **Project Number**: 784862970473
- **Primary Region**: us-central1
- **Container Registry**: us-central1-docker.pkg.dev/intersend/interspace-docker

---

## 2. Git Workflow

### 2.1 Branch Strategy

```
main (production)
├── develop (staging)
├── feature/* (new features)
├── fix/* (bug fixes)
├── hotfix/* (urgent production fixes)
├── chore/* (maintenance tasks)
└── docs/* (documentation updates)
```

### 2.2 Commit Message Format

Follow the Conventional Commits specification:

```bash
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic changes)
- `refactor`: Code restructuring
- `perf`: Performance improvements
- `test`: Test additions/modifications
- `chore`: Maintenance tasks
- `build`: Build system changes
- `ci`: CI/CD configuration changes

**Examples:**
```bash
feat(auth): add passkey authentication support
fix(profile): resolve duplicate name validation issue
docs(api): update authentication endpoint documentation
chore(deps): upgrade to prisma 5.0
```

### 2.3 Pull Request Process

1. **Create feature branch**
   ```bash
   git checkout -b feature/add-wallet-connect
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat(wallet): add WalletConnect v2 integration"
   ```

3. **Push to remote**
   ```bash
   git push origin feature/add-wallet-connect
   ```

4. **Create PR via GitHub CLI**
   ```bash
   gh pr create --title "feat: add WalletConnect v2 support" \
     --body "## Summary
   - Implement WalletConnect v2 protocol
   - Add connection management
   - Update wallet UI components
   
   ## Test Plan
   - [x] Unit tests for wallet service
   - [x] Integration tests for connection flow
   - [x] Manual testing on testnet
   
   Closes #123"
   ```

---

## 3. Pre-Push Checklist

### 3.1 Code Quality

```bash
# Run all checks before pushing
npm run check-all

# Individual checks:
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run build              # TypeScript compilation
npm audit                  # Security audit
```

### 3.2 Security Verification

- [ ] No hardcoded secrets or API keys
- [ ] No console.log statements with sensitive data
- [ ] Environment variables properly used
- [ ] Input validation on new endpoints
- [ ] Authentication required on protected routes

### 3.3 Database Changes

If your changes include database schema modifications:

```bash
# Generate migration
npm run prisma:migrate:dev -- --name descriptive_migration_name

# Verify migration
npm run prisma:migrate:deploy --dry-run

# Update Prisma Client
npm run prisma:generate
```

### 3.4 Documentation Updates

- [ ] API documentation updated if endpoints changed
- [ ] README updated if setup process changed
- [ ] Environment variables documented
- [ ] Architecture diagrams updated if needed

---

## 4. Deployment Pipeline

### 4.1 Automatic Deployments

**Development Environment:**
- Trigger: Push to `develop` branch
- Cloud Build: `cloudbuild.dev.yaml`
- Automatic database migrations
- Scales to zero when idle

**Production Environment:**
- Trigger: Push to `main` branch
- Cloud Build: `cloudbuild.prod.yaml`
- Requires manual approval
- Gradual traffic rollout

### 4.2 Cloud Build Process

```yaml
# Development deployment flow
1. Install dependencies & run tests
2. Build Docker image
3. Push to Artifact Registry
4. Deploy to Cloud Run (interspace-backend-dev)
5. Run database migrations
6. Health check validation

# Production deployment flow
1. All development steps
2. Additional security scanning
3. Deploy with traffic splitting (0% → 10% → 50% → 100%)
4. Monitor error rates between each step
5. Automatic rollback on failure
```

### 4.3 Manual Deployment

```bash
# Development
gcloud builds submit --config=docs/ai-agents/cloudbuild.dev.yaml

# Production (requires approval)
gcloud builds submit --config=docs/ai-agents/cloudbuild.prod.yaml
```

### 4.4 Database Migrations

**Development:**
```bash
# Automatic via Cloud Build
# Manual execution:
gcloud run jobs execute interspace-db-migrate-dev --region=us-central1
```

**Production:**
```bash
# Always backup first
gcloud sql backups create --instance=interspace-db-prod

# Execute migration
gcloud run jobs execute interspace-db-migrate-prod --region=us-central1
```

---

## 5. Environment Configuration

### 5.1 Service URLs

**Development:**
- Backend API: https://interspace-backend-dev-784862970473.us-central1.run.app
- Duo Node: https://interspace-duo-node-dev-784862970473.us-central1.run.app (VPC only)
- Database: interspace-dev-db (10.136.0.3)
- Redis: interspace-redis-dev (10.122.22.251)

**Production:**
- Backend API: https://interspace-backend-prod-784862970473.us-central1.run.app
- Duo Node: https://interspace-duo-node-prod-784862970473.us-central1.run.app (VPC only)
- Database: interspace-prod-db (10.136.0.4)
- Redis: interspace-redis-prod (10.124.225.156)

### 5.2 Environment Variables

**Critical Variables (stored in Secret Manager):**
- DATABASE_URL
- JWT_SECRET / JWT_REFRESH_SECRET
- SILENCE_ADMIN_TOKEN
- GOOGLE_CLIENT_ID / APPLE_CLIENT_ID
- ORBY_INSTANCE_PRIVATE_API_KEY
- SENDGRID_API_KEY

**Configuration Variables:**
- NODE_ENV: development | production
- CORS_ORIGINS: Semicolon-separated list
- RATE_LIMIT_WINDOW_MS: 60000 (dev) | 900000 (prod)
- RATE_LIMIT_MAX_REQUESTS: 1000 (dev) | 100 (prod)

### 5.3 Service Accounts

```
Development:
- interspace-backend-dev@intersend.iam.gserviceaccount.com
- interspace-duo-dev@intersend.iam.gserviceaccount.com

Production:
- interspace-backend-prod@intersend.iam.gserviceaccount.com
- interspace-duo-prod@intersend.iam.gserviceaccount.com
```

---

## 6. Service Dependencies

### 6.1 Deployment Order

When deploying multiple services, follow this order:

1. **Database migrations** (if schema changes)
2. **interspace-duo-node** (MPC proxy)
3. **interspace-backend** (main API)

### 6.2 Inter-Service Communication

```
Backend → Duo Node:
- Authentication: Google Cloud Identity token
- Network: VPC connector (interspace-connector)
- Audience: https://interspace-duo-node-{env}-784862970473.us-central1.run.app

Duo Node → Silence Duo:
- Authentication: Admin token (SILENCE_ADMIN_TOKEN)
- Network: VPC internal
- Protocol: HTTP (within VPC)
```

### 6.3 Health Checks

```bash
# Check all services
for SERVICE in backend duo-node; do
  for ENV in dev prod; do
    URL=$(gcloud run services describe interspace-$SERVICE-$ENV \
      --region=us-central1 --format="value(status.url)")
    curl -f "$URL/health" && echo "✓ $SERVICE-$ENV" || echo "✗ $SERVICE-$ENV"
  done
done
```

---

## 7. Monitoring & Rollback

### 7.1 Deployment Monitoring

**Key Metrics to Watch:**
- Error rate: Should remain < 0.1%
- Response time (p95): Should be < 200ms
- CPU usage: Should be < 70%
- Memory usage: Should be < 80%
- Active instances: Monitor for unexpected scaling

**Monitoring Commands:**
```bash
# View recent logs
gcloud run logs read --service=interspace-backend-prod --limit=100

# Watch logs in real-time
gcloud run logs tail --service=interspace-backend-prod

# View service metrics
gcloud run services describe interspace-backend-prod --region=us-central1
```

### 7.2 Rollback Procedures

**Quick Rollback (Traffic Split):**
```bash
# Get current and previous revisions
gcloud run revisions list --service=interspace-backend-prod --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic interspace-backend-prod \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1
```

**Full Rollback (Redeploy):**
```bash
# Find previous working commit
git log --oneline -10

# Checkout and deploy
git checkout <previous-commit>
gcloud builds submit --config=docs/ai-agents/cloudbuild.prod.yaml
```

### 7.3 Rollback Decision Matrix

| Symptom | Threshold | Action |
|---------|-----------|--------|
| Error rate | > 5% | Immediate rollback |
| Response time | > 1s (p95) | Monitor, prepare rollback |
| CPU usage | > 90% | Scale up, investigate |
| Memory usage | > 95% | Immediate rollback |
| Failed health checks | > 3 consecutive | Immediate rollback |

---

## 8. Emergency Procedures

### 8.1 Service Outage

1. **Immediate Actions:**
   ```bash
   # Check service status
   gcloud run services describe interspace-backend-prod --region=us-central1
   
   # Check recent deployments
   gcloud run revisions list --service=interspace-backend-prod --region=us-central1
   
   # Emergency restart
   gcloud run services update interspace-backend-prod \
     --region=us-central1 \
     --update-env-vars="RESTART=$(date +%s)"
   ```

2. **Communication:**
   - Notify #incidents Slack channel
   - Update status page
   - Inform on-call engineer

3. **Investigation:**
   - Check Cloud Monitoring dashboards
   - Review recent commits
   - Analyze error logs

### 8.2 Database Issues

```bash
# Check database status
gcloud sql instances describe interspace-prod-db

# Force restart if needed
gcloud sql instances restart interspace-prod-db

# Emergency backup
gcloud sql backups create --instance=interspace-prod-db

# Connect for manual investigation
gcloud sql connect interspace-prod-db --user=postgres
```

### 8.3 Security Incident

1. **Immediate lockdown:**
   ```bash
   # Disable public access
   gcloud run services update interspace-backend-prod \
     --no-allow-unauthenticated \
     --region=us-central1
   ```

2. **Rotate secrets:**
   ```bash
   # Update secrets in Secret Manager
   echo "new-secret" | gcloud secrets versions add JWT_SECRET --data-file=-
   
   # Redeploy services to pick up new secrets
   gcloud run services update interspace-backend-prod \
     --region=us-central1 \
     --update-env-vars="FORCE_RESTART=$(date +%s)"
   ```

### 8.4 Contact Information

**Escalation Path:**
1. On-call Engineer (PagerDuty)
2. Tech Lead
3. CTO
4. Google Cloud Support (for infrastructure issues)

**External Services:**
- Google Cloud Support: [Console](https://console.cloud.google.com/support)
- Silence Labs: Check internal documentation
- SendGrid: [Support Portal](https://support.sendgrid.com)

---

## Appendix A: Common Commands

```bash
# View all services
gcloud run services list --region=us-central1

# Get service details
gcloud run services describe interspace-backend-prod --region=us-central1

# View recent logs with error filter
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=interspace-backend-prod \
  AND severity>=ERROR" --limit=50

# Check VPC connector status
gcloud compute networks vpc-access connectors describe interspace-connector \
  --region=us-central1

# List recent builds
gcloud builds list --limit=10

# Cancel a running build
gcloud builds cancel BUILD_ID
```

## Appendix B: Troubleshooting

### Build Failures

1. **Timeout errors**: Increase timeout in cloudbuild.yaml
2. **Permission denied**: Check service account permissions
3. **Image not found**: Verify Artifact Registry permissions

### Deployment Failures

1. **Health check failing**: Check logs for startup errors
2. **Out of memory**: Increase memory limits in cloudbuild.yaml
3. **Database connection**: Verify VPC connector and private IP

### Runtime Errors

1. **CORS errors**: Check CORS_ORIGINS environment variable
2. **Authentication failures**: Verify JWT secrets and token expiration
3. **Rate limiting**: Check Redis connectivity and configuration

---

**Document Status**: ACTIVE  
**Review Cycle**: Monthly  
**Next Review**: 2025-02-20

**Note**: This document serves as the authoritative guide for all git and deployment operations. Always refer to this guide before making changes to production systems.