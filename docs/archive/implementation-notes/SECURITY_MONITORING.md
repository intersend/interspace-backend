# Security Monitoring and Anomaly Detection

## Overview

This document describes the security monitoring system that provides real-time threat detection, anomaly detection, and security alerting for the Interspace Backend.

## Features

### 1. Real-Time Security Metrics
- Failed login tracking
- Token theft detection
- Rate limit violation monitoring
- MPC operation tracking
- Suspicious activity detection

### 2. Automated Threat Detection
- **Brute Force Detection**: Alerts after 5 failed logins in 5 minutes
- **Rate Limit Abuse**: Alerts after 10 violations in 10 minutes
- **MPC Operation Abuse**: Alerts after 10 operations in 1 hour
- **Token Theft Detection**: Immediate alert on refresh token replay

### 3. Anomaly Detection
- Multiple IP addresses per user
- Unusual login times (2 AM - 5 AM)
- Geographic anomalies (future enhancement)
- Suspicious usage patterns

### 4. Security Dashboard
- Real-time security metrics
- Risk score calculation (0-100)
- Recent security alerts
- Threat visualization

## API Endpoints

### Get Security Metrics
```http
GET /api/v1/security/metrics?hours=24
Authorization: Bearer <access_token>
```

Returns security metrics for the specified time period.

### Get Security Alerts
```http
GET /api/v1/security/alerts?hours=24
Authorization: Bearer <access_token>
```

Returns recent security alerts.

### Get Security Dashboard
```http
GET /api/v1/security/dashboard
Authorization: Bearer <access_token>
```

Returns comprehensive dashboard data including metrics, alerts, and risk score.

### Check Anomalies
```http
POST /api/v1/security/check-anomalies
Authorization: Bearer <access_token>
```

Runs anomaly detection for the current user.

## Alert Types

### 1. BRUTE_FORCE
- **Trigger**: 5+ failed login attempts in 5 minutes
- **Severity**: High
- **Action**: Consider temporary IP/account lock

### 2. TOKEN_THEFT
- **Trigger**: Refresh token used after rotation
- **Severity**: Critical
- **Action**: Invalidate token family, force re-authentication

### 3. RATE_LIMIT_ABUSE
- **Trigger**: 10+ rate limit violations in 10 minutes
- **Severity**: Medium
- **Action**: Extended rate limiting, IP investigation

### 4. MPC_ABUSE
- **Trigger**: 10+ MPC operations in 1 hour
- **Severity**: Critical
- **Action**: Temporary MPC lockdown, manual review

### 5. ANOMALY
- **Trigger**: Unusual patterns detected
- **Severity**: Low to Medium
- **Action**: Log for review, increase monitoring

## Risk Score Calculation

The risk score (0-100) is calculated based on:
- Failed logins: +2 points each (max 20)
- Token thefts: +20 points each
- Rate limit violations: +1 point each (max 10)
- Suspicious activities: +5 points each (max 30)
- MPC operations: +1 point each (max 20)

## Integration Points

### 1. Authentication Service
```typescript
// Automatic brute force detection on failed login
await securityMonitoringService.checkBruteForce(userId, ipAddress);
```

### 2. Rate Limiter
```typescript
// Automatic rate limit abuse detection
await securityMonitoringService.checkRateLimitAbuse(userId, ipAddress);
```

### 3. MPC Controller
```typescript
// Automatic MPC abuse detection
await securityMonitoringService.checkMpcAbuse(userId);
```

## Monitoring Architecture

```
┌─────────────────┐
│  User Activity  │
└────────┬────────┘
         │
    ┌────▼────┐
    │ Events  │
    └────┬────┘
         │
┌────────▼────────┐     ┌─────────────┐
│  Audit Logs     │────▶│  Security   │
│  (Integrity     │     │ Monitoring  │
│   Protected)    │     │  Service    │
└─────────────────┘     └──────┬──────┘
                               │
                    ┌──────────▼──────────┐
                    │   Threat Detection  │
                    ├────────────────────┤
                    │ • Brute Force      │
                    │ • Token Theft      │
                    │ • Rate Limit Abuse │
                    │ • MPC Abuse        │
                    │ • Anomalies        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Security Alerts   │
                    ├────────────────────┤
                    │ • Console Logs     │
                    │ • Audit Trail      │
                    │ • Future: Email    │
                    │ • Future: Slack    │
                    └─────────────────────┘
```

## Development vs Production

### Development Mode
- Alerts logged to console
- Verbose security event logging
- No external notifications

### Production Mode
- Alerts can be sent to:
  - Email/SMS for critical alerts
  - Slack/Discord webhooks
  - PagerDuty integration
  - Security dashboard

## Best Practices

1. **Regular Monitoring**: Check security dashboard daily
2. **Alert Response**: Investigate high/critical alerts immediately
3. **Threshold Tuning**: Adjust thresholds based on usage patterns
4. **False Positives**: Review and tune anomaly detection
5. **Incident Response**: Have a plan for each alert type

## Future Enhancements

1. **Machine Learning**: ML-based anomaly detection
2. **Geographic Analysis**: Location-based anomaly detection
3. **Behavioral Analysis**: User behavior baselines
4. **Automated Response**: Auto-block suspicious IPs
5. **External Integration**: SIEM integration
6. **Advanced Analytics**: Predictive threat modeling

## Security Metrics Example

```json
{
  "metrics": {
    "failedLogins": 12,
    "tokenThefts": 0,
    "rateLimitViolations": 45,
    "suspiciousActivities": 3,
    "mpcOperations": 7,
    "period": "24h"
  },
  "recentAlerts": [
    {
      "type": "BRUTE_FORCE",
      "severity": "high",
      "userId": "user_123",
      "ipAddress": "192.168.1.1",
      "details": {
        "failedAttempts": 6,
        "timeWindow": "5 minutes"
      },
      "createdAt": "2024-01-15T14:30:00Z"
    }
  ],
  "riskScore": 35
}
```