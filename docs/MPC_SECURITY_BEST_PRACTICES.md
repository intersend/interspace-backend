# MPC Wallet Security Best Practices and Operational Procedures

## Executive Summary

This document outlines the security best practices and operational procedures for the Interspace MPC (Multi-Party Computation) wallet system. The MPC wallet implementation uses Silence Labs' 2-of-2 threshold signature scheme to ensure that neither the client nor the server can independently access user funds.

## Table of Contents

1. [Architecture Security](#architecture-security)
2. [Key Management](#key-management)
3. [Network Security](#network-security)
4. [Authentication & Authorization](#authentication--authorization)
5. [Data Protection](#data-protection)
6. [Operational Security](#operational-security)
7. [Incident Response](#incident-response)
8. [Compliance & Auditing](#compliance--auditing)
9. [Development Security](#development-security)
10. [Monitoring & Alerting](#monitoring--alerting)

## Architecture Security

### Component Isolation

1. **Network Segmentation**
   - Duo Node: Public-facing proxy with authentication
   - Silence Labs Server: Internal service, no public access
   - Database: Private subnet, encrypted connections only

2. **Service Communication**
   ```
   iOS App → Backend → Duo Node → Silence Labs Server → PostgreSQL
             (JWT)    (Google ID)    (Internal VPC)      (Cloud SQL)
   ```

3. **Trust Boundaries**
   - Client holds P1 share (iOS Keychain + Secure Enclave)
   - Server holds P2 share (PostgreSQL + AES-256-GCM)
   - Neither party can sign independently

### Security Principles

- **Zero Trust**: Every request authenticated and authorized
- **Defense in Depth**: Multiple security layers
- **Least Privilege**: Minimal permissions for each component
- **Fail Secure**: Deny by default on any error

## Key Management

### Key Generation

1. **Entropy Requirements**
   - Use platform-specific secure random generators
   - iOS: `SecRandomCopyBytes`
   - Backend: `crypto.randomBytes` with sufficient entropy

2. **Key Distribution**
   ```typescript
   // Never transmit full keys
   clientShare = generateP1Share() // Stays on device
   serverShare = generateP2Share() // Stays on server
   publicKey = derivePublicKey(clientShare, serverShare)
   ```

3. **Key Storage**
   - **iOS**: Keychain with hardware backing
   - **Backend**: Encrypted in database
   - **Encryption Key**: Stored in environment variable

### Key Rotation

1. **Automatic Rotation**
   - Schedule: Every 30 days
   - Process: Key refresh protocol (maintains same public key)
   - Audit: Log all rotation events

2. **Manual Rotation Triggers**
   - Suspected key compromise
   - Employee termination
   - Security audit findings

3. **Rotation Process**
   ```bash
   # 1. Initiate rotation
   POST /api/v1/mpc/rotate
   
   # 2. Client generates new P1 share
   # 3. Server generates new P2 share
   # 4. Verify public key unchanged
   # 5. Destroy old shares
   ```

### Key Backup & Recovery

1. **Backup Requirements**
   - RSA-4096 encryption for backups
   - Verifiable backup format
   - Time-limited backup validity

2. **Recovery Process**
   - Requires 2FA + additional verification
   - Rate limited to 1 per day
   - Audit trail for all recoveries

## Network Security

### TLS Configuration

1. **Minimum TLS 1.3**
   ```nginx
   ssl_protocols TLSv1.3;
   ssl_ciphers ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
   ssl_prefer_server_ciphers off;
   ```

2. **Certificate Pinning (iOS)**
   ```swift
   let pinnedCertificates = [
       "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
   ]
   ```

3. **HSTS Headers**
   ```
   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
   ```

### API Security

1. **Rate Limiting**
   - General: 100 requests/15 minutes/IP
   - MPC Operations: 10 requests/15 minutes/IP
   - Export/Backup: 1 request/hour/user

2. **Request Signing**
   ```typescript
   const signature = hmac('sha256', secret)
     .update(method + path + timestamp + body)
     .digest('hex');
   ```

3. **WebSocket Security**
   - WSS only (no plain WS)
   - Token-based authentication
   - Heartbeat for connection monitoring
   - Automatic reconnection with backoff

## Authentication & Authorization

### Multi-Factor Authentication

1. **Required For**
   - Profile creation
   - Transaction signing
   - Key backup/export/rotation
   - Settings changes

2. **2FA Methods**
   - TOTP (Google Authenticator)
   - SMS (with anti-SIM swap measures)
   - Biometric (iOS Face ID/Touch ID)

3. **Session Management**
   - JWT with 1-hour expiry
   - Refresh tokens with rotation
   - Device binding for sessions

### Authorization Matrix

| Operation | User Auth | 2FA | Biometric | Profile Owner | Rate Limited |
|-----------|-----------|-----|-----------|---------------|--------------|
| View Balance | ✓ | - | - | ✓ | - |
| Create Wallet | ✓ | ✓ | ✓ | - | ✓ |
| Sign Transaction | ✓ | ✓ | ✓ | ✓ | ✓ |
| Backup Key | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export Key | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rotate Key | ✓ | ✓ | ✓ | ✓ | ✓ |

### Service Authentication

1. **Google Cloud Identity**
   ```typescript
   const client = new OAuth2Client();
   const ticket = await client.verifyIdToken({
     idToken: token,
     audience: DUO_NODE_AUDIENCE_URL,
   });
   ```

2. **Service Account Permissions**
   - Principle of least privilege
   - Separate accounts per service
   - Regular key rotation

## Data Protection

### Encryption at Rest

1. **Database Encryption**
   - Cloud SQL: Encryption by default
   - Application-level: AES-256-GCM
   - Key derivation: PBKDF2 with 100,000 iterations

2. **iOS Keychain**
   ```swift
   let query = [
     kSecClass: kSecClassGenericPassword,
     kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
     kSecUseDataProtectionKeychain: true
   ]
   ```

3. **Backup Encryption**
   - RSA-4096 for key wrapping
   - AES-256-GCM for data encryption
   - HMAC-SHA256 for integrity

### Encryption in Transit

1. **All Communications Over TLS 1.3**
2. **Additional Application-Layer Encryption for Sensitive Data**
3. **No Sensitive Data in URLs or Logs**

### Data Retention

1. **Key Shares**: Indefinite (required for wallet access)
2. **Transaction Logs**: 7 years (regulatory requirement)
3. **Audit Logs**: 1 year minimum
4. **Session Data**: 24 hours after expiry

## Operational Security

### Deployment Security

1. **Infrastructure as Code**
   ```yaml
   # All infrastructure defined in version control
   # Automated deployment via CI/CD
   # No manual configuration changes
   ```

2. **Immutable Infrastructure**
   - Container-based deployments
   - No SSH access to production
   - Rolling updates only

3. **Secret Management**
   - Google Secret Manager for credentials
   - Automated secret rotation
   - No secrets in code or configs

### Access Control

1. **Production Access**
   - Requires approval from 2 team members
   - Time-limited access (max 8 hours)
   - Full audit trail
   - Break-glass procedure for emergencies

2. **Database Access**
   - Read-only by default
   - Write access requires justification
   - All queries logged
   - No direct production access

### Change Management

1. **Code Changes**
   - Peer review required
   - Automated security scanning
   - Staging deployment first
   - Gradual rollout (10% → 50% → 100%)

2. **Configuration Changes**
   - Version controlled
   - Requires approval
   - Automated validation
   - Rollback plan required

## Incident Response

### Incident Classification

| Severity | Description | Response Time | Examples |
|----------|-------------|---------------|----------|
| Critical | User funds at risk | < 15 minutes | Key compromise, data breach |
| High | Service degradation | < 1 hour | API down, high error rate |
| Medium | Limited impact | < 4 hours | Slow performance, minor bugs |
| Low | No immediate impact | < 24 hours | Documentation issues |

### Response Procedures

1. **Detection**
   - Automated alerting
   - User reports
   - Security monitoring

2. **Containment**
   ```bash
   # 1. Isolate affected systems
   kubectl cordon node-xxx
   
   # 2. Disable affected features
   kubectl set env deployment/app FEATURE_MPC=false
   
   # 3. Increase monitoring
   kubectl scale deployment/monitoring --replicas=5
   ```

3. **Investigation**
   - Preserve evidence
   - Timeline reconstruction
   - Root cause analysis

4. **Recovery**
   - Fix vulnerabilities
   - Restore service
   - Verify integrity

5. **Post-Mortem**
   - Blameless analysis
   - Lessons learned
   - Process improvements

### Key Compromise Procedures

1. **Immediate Actions**
   - Disable affected wallets
   - Notify affected users
   - Begin key rotation

2. **Investigation**
   - Audit access logs
   - Check for unauthorized transactions
   - Identify compromise vector

3. **Remediation**
   - Rotate all affected keys
   - Patch vulnerabilities
   - Enhance monitoring

## Compliance & Auditing

### Audit Requirements

1. **Audit Logs Must Include**
   - Timestamp (UTC)
   - User ID
   - Action performed
   - Resource affected
   - Result (success/failure)
   - IP address
   - User agent

2. **Log Retention**
   - Security events: 2 years
   - Access logs: 1 year
   - Transaction logs: 7 years

3. **Log Protection**
   - Immutable storage
   - Encryption at rest
   - Access controls
   - Integrity verification

### Compliance Standards

1. **SOC 2 Type II**
   - Annual audit
   - Continuous monitoring
   - Control documentation

2. **GDPR**
   - Data minimization
   - Right to erasure (where possible)
   - Data portability
   - Privacy by design

3. **PCI DSS** (if handling card data)
   - Network segmentation
   - Encryption requirements
   - Access controls
   - Regular testing

### Security Audits

1. **Internal Audits**
   - Quarterly security reviews
   - Monthly access reviews
   - Weekly vulnerability scans

2. **External Audits**
   - Annual penetration testing
   - Bi-annual code audit
   - Continuous bug bounty program

## Development Security

### Secure Coding Practices

1. **Input Validation**
   ```typescript
   // Always validate and sanitize inputs
   const schema = Joi.object({
     profileId: Joi.string().uuid().required(),
     amount: Joi.number().positive().required(),
     address: Joi.string().regex(/^0x[a-fA-F0-9]{40}$/).required()
   });
   ```

2. **Output Encoding**
   - HTML encoding for web outputs
   - JSON encoding for API responses
   - SQL parameterization for queries

3. **Error Handling**
   ```typescript
   // Never expose internal errors
   try {
     // operation
   } catch (error) {
     logger.error('Internal error', error);
     res.status(500).json({ error: 'Internal server error' });
   }
   ```

### Dependency Management

1. **Vulnerability Scanning**
   - Daily automated scans
   - Critical updates within 24 hours
   - Regular dependency updates

2. **Supply Chain Security**
   - Verify package signatures
   - Use lock files
   - Private registry for critical deps

### Security Testing

1. **Static Analysis (SAST)**
   - Run on every commit
   - Block merges on high severity
   - Regular rule updates

2. **Dynamic Analysis (DAST)**
   - Nightly scans on staging
   - API security testing
   - Authentication testing

3. **Dependency Scanning**
   - Check for known vulnerabilities
   - License compliance
   - Outdated package alerts

## Monitoring & Alerting

### Key Metrics

1. **Security Metrics**
   - Authentication failure rate
   - Rate limit violations
   - Error rates by endpoint
   - Latency percentiles

2. **Operational Metrics**
   - Transaction success rate
   - Key operation success rate
   - WebSocket connection stability
   - Database connection pool

### Alert Configuration

1. **Critical Alerts** (Page immediately)
   - Authentication bypass attempts
   - High error rate (>5%)
   - Service downtime
   - Database unreachable

2. **Warning Alerts** (Notify on-call)
   - Elevated error rate (>1%)
   - High latency (p95 > 2s)
   - Rate limit violations spike
   - Certificate expiry < 30 days

3. **Info Alerts** (Log for review)
   - Successful key rotations
   - Backup operations
   - Configuration changes

### Security Information and Event Management (SIEM)

1. **Log Aggregation**
   - Centralized logging platform
   - Real-time analysis
   - Long-term storage

2. **Correlation Rules**
   - Multiple failed auth from same IP
   - Unusual transaction patterns
   - Access from new locations
   - Privilege escalation attempts

3. **Threat Intelligence**
   - IP reputation checking
   - Known attack patterns
   - Zero-day monitoring

## Emergency Procedures

### Break-Glass Access

1. **When to Use**
   - Critical production issue
   - No on-call engineer available
   - Time-sensitive security incident

2. **Process**
   - Document reason
   - Get verbal approval
   - Use break-glass credentials
   - Full audit within 24 hours

### Disaster Recovery

1. **RTO/RPO Targets**
   - Recovery Time Objective: 1 hour
   - Recovery Point Objective: 15 minutes

2. **Backup Strategy**
   - Database: Continuous replication
   - Configuration: Version controlled
   - Secrets: Encrypted backups

3. **Recovery Testing**
   - Monthly DR drills
   - Documented procedures
   - Regular updates

## Security Checklist

### Daily
- [ ] Review security alerts
- [ ] Check authentication metrics
- [ ] Monitor rate limiting
- [ ] Verify backup completion

### Weekly
- [ ] Review access logs
- [ ] Update security patches
- [ ] Test monitoring alerts
- [ ] Review error patterns

### Monthly
- [ ] Access review
- [ ] Security training
- [ ] DR drill
- [ ] Update documentation

### Quarterly
- [ ] Security assessment
- [ ] Penetration testing
- [ ] Policy review
- [ ] Vendor assessment

### Annually
- [ ] Full security audit
- [ ] Compliance certification
- [ ] Architecture review
- [ ] Incident response training

## Contact Information

### Security Team
- Email: security@interspace.fi
- On-call: +1-XXX-XXX-XXXX
- Slack: #security-alerts

### Incident Response
- Critical: page-security@interspace.fi
- High: security-oncall@interspace.fi
- Medium/Low: security@interspace.fi

### External Contacts
- Silence Labs Support: support@silencelabs.com
- Google Cloud Support: [Console](https://console.cloud.google.com/support)
- Security Researcher: security-bounty@interspace.fi

---

**Document Version**: 1.0
**Last Updated**: 2024-01-XX
**Next Review**: 2024-04-XX
**Owner**: Security Team