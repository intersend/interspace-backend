# 🛡️ Security Configuration Guide

## Overview

This guide covers the security configurations and best practices for deploying the Interspace backend in different environments.

## Environment Configuration

### Development Environment

For local development and iOS testing with ngrok:

```env
NODE_ENV=development
BYPASS_LOGIN=true
CORS_ORIGINS=*
RATE_LIMIT_MAX_REQUESTS=500  # More permissive for development
```

**Development Features:**
- ✅ BYPASS_LOGIN enabled for easier testing
- ✅ Permissive CORS for ngrok URLs
- ✅ Higher rate limits
- ✅ Detailed error messages and stack traces
- ✅ Request/response logging

### Production Environment

**Critical Security Requirements:**

```env
NODE_ENV=production
BYPASS_LOGIN=false  # MUST be false
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com  # NO wildcards
RATE_LIMIT_MAX_REQUESTS=100
```

**Production Security Features:**
- 🔒 Strict CORS validation
- 🔒 Content Security Policy (CSP) headers
- 🔒 HTTP Strict Transport Security (HSTS)
- 🔒 No stack traces in error responses
- 🔒 Request ID correlation for debugging
- 🔒 Configuration validation on startup

## CORS Configuration for iOS Development

### Using ngrok for iOS Development

The backend automatically supports ngrok URLs in development mode:

```typescript
// Automatically allowed in development:
- localhost variants
- 127.0.0.1
- ngrok.io domains
- ngrok.app domains  
- ngrok-free.app domains
```

### Example ngrok Setup

1. Install ngrok: `npm install -g ngrok`
2. Start your backend: `npm run dev`
3. In another terminal: `ngrok http 3000`
4. Use the ngrok URL in your iOS app

The backend will automatically accept requests from any ngrok URL when `NODE_ENV=development`.

## Security Headers

### Production Headers Applied

```typescript
// Content Security Policy
defaultSrc: ["'self'"]
scriptSrc: ["'self'"]
styleSrc: ["'self'", "'unsafe-inline'"]
imgSrc: ["'self'", "data:", "https:"]

// HTTP Strict Transport Security
HSTS: maxAge: 31536000 (1 year)
includeSubDomains: true

// Additional Security
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: same-origin
```

### Development Mode
- CSP disabled for flexibility
- HSTS disabled for localhost testing
- Less restrictive headers for easier development

## Rate Limiting

### Development Limits (Generous)
- **API calls**: 500 requests per 15 minutes
- **Authentication**: 500 requests per 15 minutes  
- **Transactions**: 1000 requests per 15 minutes

### Production Limits (Secure)
- **API calls**: 100 requests per 15 minutes
- **Authentication**: 20 requests per 15 minutes
- **Transactions**: 100 requests per 15 minutes

## Error Handling

### Production Error Responses
```json
{
  "success": false,
  "error": "Generic error message",
  "code": "ERROR_CODE",
  "requestId": "req_1234567890_abc123"
}
```

### Development Error Responses
```json
{
  "success": false,
  "error": "Detailed error message",
  "code": "ERROR_CODE", 
  "requestId": "req_1234567890_abc123",
  "debugInfo": {
    "operation": "linkAccount",
    "receivedFields": ["address", "walletType"],
    "missingFields": ["signature"]
  },
  "stack": "Error stack trace..."
}
```

## Authentication Security

### JWT Configuration
- **Access tokens**: 15 minutes expiry
- **Refresh tokens**: 7 days expiry
- **Device-based tokens**: Multi-device support
- **Token rotation**: Automatic refresh token rotation

### Social Authentication
- ✅ Google OAuth token verification
- ✅ Apple Sign-In token verification
- ✅ Passkey (WebAuthn) support
- ✅ Multi-strategy user accounts

## Database Security

### Query Protection
- ✅ Prisma ORM prevents SQL injection
- ✅ Parameterized queries only
- ✅ User-scoped data access
- ✅ Transaction isolation level: Serializable

### Data Encryption
- ✅ MPC key shares encrypted
- ✅ Sensitive data hashed/encrypted
- ✅ JWT secrets require 32+ characters

## Environment Validation

The system automatically validates configuration on startup:

### Production Validations (Will exit if failed)
- ❌ `BYPASS_LOGIN` must be `false`
- ❌ `CORS_ORIGINS` cannot include `*`
- ❌ JWT secrets must be 32+ characters
- ❌ All required environment variables present

### Development Warnings
- ⚠️  `BYPASS_LOGIN` enabled (expected)
- ⚠️  `CORS_ORIGINS` includes `*` (OK for dev)

## Deployment Checklist

### Pre-Production
- [ ] Set `NODE_ENV=production`
- [ ] Set `BYPASS_LOGIN=false`
- [ ] Configure specific `CORS_ORIGINS` (no wildcards)
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Set production database URL
- [ ] Configure production Orby keys

### Post-Deployment
- [ ] Verify configuration validation passes
- [ ] Test CORS with your actual domains
- [ ] Confirm rate limiting is working
- [ ] Check error responses don't leak information
- [ ] Verify security headers are present

## Monitoring Recommendations

### Log These Events
- Authentication attempts and failures
- Rate limit violations
- CORS violations
- Database errors
- Configuration validation failures

### Don't Log These (Security)
- JWT tokens
- Password hashes
- API keys
- User personal data

## Development Tips

### iOS Testing with ngrok
1. Your backend automatically allows ngrok URLs in development
2. No need to update CORS_ORIGINS manually
3. Use ngrok's stable subdomain for consistency
4. Test with both `https://` and `http://` protocols

### Debug Mode Features
- Detailed error messages
- Stack traces included
- Request/response logging
- Higher rate limits
- Permissive CORS

### Quick Development Setup
```bash
# 1. Copy development environment
cp .env.development.example .env

# 2. Start development server  
npm run dev

# 3. In another terminal, start ngrok
ngrok http 3000

# 4. Use the ngrok URL in your iOS app
```

The backend will automatically work with any ngrok URL without configuration changes.