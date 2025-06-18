# DEPLOYMENT ARCHITECTURE - INTERSPACE PLATFORM
**Classification**: Technical Documentation  
**Version**: 1.0.0  
**Last Updated**: 2025-06-18  
**Status**: ACTIVE

## EXECUTIVE SUMMARY

The Interspace Platform implements a zero-trust, defense-in-depth architecture utilizing Google Cloud Platform (GCP) infrastructure. The system employs multi-party computation (MPC) for cryptographic operations, ensuring no single point of failure for wallet operations.

## 1. STRATEGIC ARCHITECTURE OVERVIEW

### 1.1 System Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INTERNET (UNTRUSTED ZONE)                        │
│                                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │   iOS App   │  │   Web App    │  │  Partners   │  │   Attackers  │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └──────────────┘ │
└─────────┼───────────────┼──────────────────┼───────────────────────────┘
          │               │                  │
          ▼               ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD ARMOR (DDoS PROTECTION)                  │
│                         Rate Limiting: 100 req/15min                     │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    CLOUD LOAD BALANCER (HTTPS ONLY)                      │
│                    ┌─────────────────────────────┐                       │
│                    │   SSL/TLS Termination       │                       │
│                    │   Certificate: *.interspace.fi                      │
│                    └─────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
         ┌──────────────────┐          ┌──────────────────┐
         │  BACKEND (DEV)   │          │  BACKEND (PROD)  │
         │ Cloud Run        │          │ Cloud Run        │
         │ Public Access    │          │ Public Access    │
         │ 0-5 instances    │          │ 1-100 instances  │
         └────────┬─────────┘          └────────┬─────────┘
                  │                              │
                  └──────────────┬───────────────┘
                                 │
                        VPC: interspace-vpc
                        ┌────────┴────────┐
                        │ VPC CONNECTOR   │
                        │ 10.8.0.16/28    │
                        └────────┬────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  DUO NODE (DEV) │    │ DUO NODE (PROD) │    │ SILENCE DUO SVR │
│  Cloud Run      │    │  Cloud Run      │    │  (MPC Backend)  │
│  VPC Only       │    │  VPC Only       │    │  VPC Only       │
│  No Public IP   │    │  No Public IP   │    │  No Public IP   │
└────────┬────────┘    └────────┬────────┘    └─────────────────┘
         │                      │
         └──────────┬───────────┘
                    │
         ┌──────────┴───────────┬─────────────────────┐
         │                      │                     │
         ▼                      ▼                     ▼
┌─────────────────┐    ┌─────────────────┐   ┌─────────────────┐
│  CLOUD SQL DEV  │    │ CLOUD SQL PROD  │   │   REDIS (DEV)   │
│  PostgreSQL 15  │    │  PostgreSQL 15  │   │   Memorystore   │
│  10.136.0.3     │    │  10.136.0.4     │   │  10.122.22.251  │
│  No Public IP   │    │  HA Enabled     │   │   Basic Tier    │
└─────────────────┘    └─────────────────┘   └─────────────────┘
                                              ┌─────────────────┐
                                              │  REDIS (PROD)   │
                                              │   Memorystore   │
                                              │ 10.124.225.156  │
                                              │  Standard Tier  │
                                              └─────────────────┘
```

### 1.2 Security Zones

| Zone | Classification | Access Control | Services |
|------|---------------|----------------|----------|
| Public Internet | UNTRUSTED | Cloud Armor, Rate Limiting | Client Applications |
| DMZ | RESTRICTED | Load Balancer, SSL/TLS | Backend API Services |
| Private Network | CONFIDENTIAL | VPC, IAM, Service Accounts | Duo Node, Databases |
| Secret Store | TOP SECRET | KMS, Secret Manager | Cryptographic Keys |

## 2. NETWORK ARCHITECTURE

### 2.1 VPC Configuration

```yaml
Network Name: interspace-vpc
Mode: Custom
Routing: Regional
Subnets:
  - Name: interspace-subnet
    Region: us-central1
    CIDR: 10.0.0.0/20
    Private Google Access: Enabled
    Flow Logs: Enabled
  
  - Name: interspace-connector-subnet
    Region: us-central1
    CIDR: 10.8.0.0/28
    Purpose: VPC Connector Only
```

### 2.2 Firewall Rules

```yaml
Ingress Rules:
  - Name: deny-all-ingress
    Priority: 65534
    Action: DENY
    Source: 0.0.0.0/0
    Target: All
  
  - Name: allow-cloud-run-to-sql
    Priority: 1000
    Action: ALLOW
    Protocol: TCP
    Ports: [5432]
    Source: 10.0.0.0/20
    Target: cloud-sql
  
  - Name: allow-health-checks
    Priority: 900
    Action: ALLOW
    Protocol: TCP
    Ports: [3000, 3001]
    Source: 35.191.0.0/16, 130.211.0.0/22
    Target: cloud-run

Egress Rules:
  - Default: ALLOW (Stateful)
```

### 2.3 Service Communication Matrix

| Source | Destination | Protocol | Port | Authentication |
|--------|-------------|----------|------|----------------|
| Client Apps | Backend API | HTTPS | 443 | JWT Bearer Token |
| Backend API | Duo Node | HTTPS | 443 | Service Account + Audience |
| Backend API | Cloud SQL | PostgreSQL | 5432 | SSL + Password |
| Backend API | Redis | Redis Protocol | 6379 | Network Isolation |
| Duo Node | Silence Duo | HTTPS | 443 | Admin Token |

## 3. SERVICE ARCHITECTURE

### 3.1 Backend Service (Public API)

```yaml
Service: interspace-backend-{dev|prod}
Type: Cloud Run (Fully Managed)
Container:
  Image: us-central1-docker.pkg.dev/intersend/interspace-docker/interspace-backend-{env}
  Port: 3000
  Protocol: HTTP/2
  
Resources:
  CPU: 1-2 vCPU
  Memory: 1-2 GiB
  Concurrency: 80 requests
  Timeout: 300 seconds
  
Scaling:
  Min Instances: 0 (dev) | 1 (prod)
  Max Instances: 5 (dev) | 100 (prod)
  
Security:
  Service Account: interspace-backend-{env}@intersend.iam.gserviceaccount.com
  Ingress: All (Public)
  VPC Connector: interspace-connector
  VPC Egress: private-ranges-only
```

### 3.2 Duo Node Service (MPC Wallet)

```yaml
Service: interspace-duo-node-{dev|prod}
Type: Cloud Run (Fully Managed)
Container:
  Image: us-central1-docker.pkg.dev/intersend/interspace-docker/interspace-duo-node-{env}
  Port: 3001
  Protocol: HTTP/2
  
Resources:
  CPU: 1-2 vCPU
  Memory: 512Mi-1Gi
  Concurrency: 100 requests
  Timeout: 60 seconds
  
Scaling:
  Min Instances: 0 (dev) | 1 (prod)
  Max Instances: 10 (dev) | 50 (prod)
  
Security:
  Service Account: interspace-duo-{env}@intersend.iam.gserviceaccount.com
  Ingress: Internal (VPC Only)
  VPC Connector: interspace-connector
  VPC Egress: all-traffic
  
Authorization:
  - Only interspace-backend-{env} service account can invoke
  - Requires valid audience token
```

### 3.3 Data Storage Architecture

#### 3.3.1 Cloud SQL PostgreSQL

```yaml
Development:
  Instance: interspace-db-dev
  Version: PostgreSQL 15
  Tier: db-g1-small
  Storage: 10GB SSD
  Backups: Daily, 7 days retention
  Point-in-Time Recovery: Enabled
  
Production:
  Instance: interspace-db-prod
  Version: PostgreSQL 15
  Tier: db-custom-2-8192
  Storage: 100GB SSD
  High Availability: Regional
  Backups: Daily, 30 days retention
  Point-in-Time Recovery: Enabled
  Read Replicas: Available
```

#### 3.3.2 Redis (Memorystore)

```yaml
Development:
  Instance: interspace-redis-dev
  Version: Redis 7.2
  Tier: Basic
  Memory: 1GB
  Persistence: RDB snapshots
  
Production:
  Instance: interspace-redis-prod
  Version: Redis 7.2
  Tier: Standard
  Memory: 5GB
  High Availability: Enabled
  Replicas: 1
  Persistence: RDB + AOF
```

## 4. SECURITY ARCHITECTURE

### 4.1 Authentication & Authorization

```
┌─────────────────┐
│   Client App    │
└────────┬────────┘
         │ 1. Login Request
         ▼
┌─────────────────┐
│  Backend API    │──────► Social Auth Providers
└────────┬────────┘        (Google, Apple)
         │ 2. Generate JWT
         ▼
┌─────────────────┐
│  JWT Structure  │
│ ┌─────────────┐ │
│ │   Header    │ │ alg: HS256
│ ├─────────────┤ │
│ │   Payload   │ │ sub: userId
│ │             │ │ iat: timestamp
│ │             │ │ exp: 15 minutes
│ ├─────────────┤ │
│ │  Signature  │ │ HMAC-SHA256
│ └─────────────┘ │
└─────────────────┘
```

### 4.2 Cryptographic Architecture

```
MPC Wallet Creation:
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Backend  │────►│ Duo Node │────►│ Silence  │
│          │     │          │     │   Duo    │
└──────────┘     └──────────┘     └──────────┘
     │                │                 │
     │   Request      │    Generate     │
     │   Creation     │    Key Share    │
     │                │       P1        │
     │                ▼                 ▼
     │         ┌──────────┐      ┌──────────┐
     │         │Key Share │      │Key Share │
     │         │    P1    │      │    P2    │
     │         └──────────┘      └──────────┘
     │                │                 │
     │                └────────┬────────┘
     │                         │
     │                    Threshold = 2
     ▼                         │
Store Encrypted               ▼
in Database            Complete Wallet
```

### 4.3 Secrets Management

| Secret Type | Storage | Rotation | Access |
|-------------|---------|----------|--------|
| Database Passwords | Secret Manager | 90 days | Service Accounts |
| JWT Secrets | Secret Manager | 30 days | Backend Only |
| Encryption Keys | Secret Manager | Never | Backend Only |
| OAuth Credentials | Secret Manager | As needed | Backend Only |
| API Keys | Secret Manager | 180 days | Specific Services |

### 4.4 Threat Model

```
Threat Vectors:
┌─────────────────────────────────────────┐
│           EXTERNAL THREATS              │
├─────────────────────────────────────────┤
│ • DDoS Attacks → Cloud Armor           │
│ • SQL Injection → Parameterized Queries│
│ • XSS Attacks → Input Sanitization     │
│ • MITM → TLS 1.3 Everywhere           │
│ • Brute Force → Rate Limiting          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│           INTERNAL THREATS              │
├─────────────────────────────────────────┤
│ • Privilege Escalation → Least Privilege│
│ • Data Exfiltration → VPC Egress Control│
│ • Service Compromise → Service Isolation│
│ • Key Theft → MPC Architecture         │
└─────────────────────────────────────────┘
```

## 5. OPERATIONAL ARCHITECTURE

### 5.1 Deployment Pipeline

```
Source Code → Cloud Build → Artifact Registry → Cloud Run
     │              │              │                │
     │              │              │                │
  Git Push    Build & Test   Store Image      Deploy
     │              │              │                │
     ▼              ▼              ▼                ▼
  Trigger      Dockerfile    Tagged Image    Rolling Update
```

### 5.2 High Availability Architecture

```yaml
Production HA Configuration:
  Database:
    - Primary: us-central1-f
    - Standby: us-central1-b
    - Automatic Failover: < 60 seconds
    
  Redis:
    - Primary: us-central1
    - Replica: us-central1
    - Automatic Failover: < 30 seconds
    
  Cloud Run:
    - Multi-zone deployment
    - Minimum 1 instance always running
    - Auto-scaling based on CPU/concurrency
    
  Uptime Target: 99.95% (22 minutes downtime/month)
```

### 5.3 Disaster Recovery

```yaml
RPO (Recovery Point Objective):
  - Database: 5 minutes (PITR)
  - Redis: 1 hour (snapshots)
  - Secrets: 0 (replicated)
  
RTO (Recovery Time Objective):
  - Service Failure: < 5 minutes (auto-restart)
  - Zone Failure: < 10 minutes (multi-zone)
  - Region Failure: < 4 hours (manual intervention)
  
Backup Strategy:
  - Database: Daily automated + on-demand
  - Code: Git repository (source of truth)
  - Infrastructure: Terraform state (future)
  - Secrets: Encrypted backups in separate project
```

## 6. MONITORING & OBSERVABILITY

### 6.1 Metrics Architecture

```
Application → Cloud Logging → Cloud Monitoring → Alerts
     │              │                │              │
     │              │                │              │
  Log Entry    Structured Logs   Metrics      Notification
     │              │                │              │
     ▼              ▼                ▼              ▼
 Trace ID      Log Sink         Dashboard    Slack/PagerDuty
```

### 6.2 Key Performance Indicators

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Latency (p95) | < 200ms | > 500ms |
| Error Rate | < 0.1% | > 1% |
| CPU Utilization | < 70% | > 85% |
| Memory Usage | < 80% | > 90% |
| Database Connections | < 80% max | > 90% max |

## 7. COMPLIANCE & GOVERNANCE

### 7.1 Data Residency

- **Primary Region**: us-central1 (Iowa, USA)
- **Data Classification**: Financial data, PII
- **Encryption**: AES-256-GCM at rest, TLS 1.3 in transit
- **Key Management**: Google Cloud KMS

### 7.2 Audit Trail

```yaml
Audit Requirements:
  - All API calls logged with request ID
  - Database changes tracked with user ID
  - Secret access logged in Cloud Audit Logs
  - Retention: 1 year minimum
  - Tamper Protection: Write-once audit logs
```

## 8. COST OPTIMIZATION

### 8.1 Resource Allocation

```yaml
Development Environment:
  - Cloud Run: Scale to zero when idle
  - Database: Smallest tier (db-g1-small)
  - Redis: Basic tier, no HA
  - Estimated Cost: ~$50-100/month
  
Production Environment:
  - Cloud Run: Minimum 1 instance
  - Database: Custom tier with HA
  - Redis: Standard tier with replica
  - Estimated Cost: ~$500-1000/month
```

### 8.2 Cost Controls

- **Budget Alerts**: Set at 50%, 90%, 100% of monthly budget
- **Resource Quotas**: Prevent runaway scaling
- **Idle Resource Cleanup**: Automated via Cloud Scheduler

## APPENDIX A: NETWORK FLOW DIAGRAMS

### A.1 Authentication Flow

```
Client → LB → Backend → Database
         ↓      ↓
       SSL    JWT Validation
              ↓
            Session Creation
              ↓
            Response
```

### A.2 MPC Operation Flow

```
Client → Backend → Duo Node → Silence Duo
           ↓          ↓           ↓
      Validate    Get Share   Get Share
           ↓          ↓           ↓
      Authorize   Combine    Threshold
           ↓          ↓           ↓
        Store    Sign/Operate  Return
```

## APPENDIX B: SECURITY CONTROLS MATRIX

| Control | Implementation | Validation |
|---------|---------------|------------|
| Network Isolation | VPC, Private IPs | Penetration Test |
| Access Control | IAM, Service Accounts | Access Review |
| Encryption | TLS, AES-256 | Crypto Audit |
| Secrets Management | Secret Manager | Rotation Audit |
| Monitoring | Cloud Monitoring | Alert Testing |
| Incident Response | Runbooks | Tabletop Exercise |

---

**END OF DOCUMENT**

**Distribution**: Engineering, Security, Operations  
**Review Cycle**: Quarterly  
**Next Review**: 2025-09-18