# Silence Labs MPC Integration Guide

## Overview

This document describes the integration between Interspace Backend and Silence Labs' Multi-Party Computation (MPC) wallet infrastructure. The integration provides secure 2-of-2 threshold signatures where neither the client nor the server can sign transactions independently.

## Architecture

### Components

1. **Interspace Backend** - Main API server that handles user authentication and profile management
2. **Duo Node** - Authenticated proxy service that sits between the backend and Silence Labs Duo Server
3. **Silence Labs Duo Server** - The actual MPC server that manages server-side key shares
4. **Mobile SDK** - Client-side component that holds user key shares (not covered here)

### Security Model

- **2-of-2 MPC**: Both client and server shares are required to sign any transaction
- **Google Cloud Authentication**: Service-to-service authentication using ID tokens
- **Rate Limiting**: Strict limits on sensitive operations like backup and export
- **Audit Logging**: All MPC operations are logged for security monitoring

## Setup Instructions

### 1. Duo Node Deployment

The Duo Node acts as a secure proxy to the Silence Labs Duo Server.

#### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Server Configuration
PORT=3001

# Duo Server Configuration
DUO_SERVER_URL=http://sigpair:8080  # Docker internal URL

# Google Cloud Authentication
DUO_NODE_AUDIENCE_URL=https://interspace-duo-node-prod-PROJECT_NUMBER.us-central1.run.app

# Optional
LOG_LEVEL=info
REQUEST_TIMEOUT_MS=30000
MAX_REQUEST_SIZE=1mb
```

#### Docker Compose Setup

```yaml
version: '3.1'

services:
  db:
    image: postgres:14
    restart: always
    environment:
      POSTGRES_PASSWORD: sigpair
      POSTGRES_USER: sigpair
      POSTGRES_DB: sigpair
    ports:
      - 5432:5432

  sigpair:
    image: ghcr.io/silence-laboratories/duo-server:v2-latest
    restart: always
    environment:
      PGHOST: db
      PGUSER: sigpair
      PGDATABASE: sigpair
      PGPASSWORD: sigpair
    ports:
      - 8080:8080
    depends_on:
      - db

  duo-node:
    build: .
    restart: always
    environment:
      DUO_SERVER_URL: http://sigpair:8080
      DUO_NODE_AUDIENCE_URL: ${DUO_NODE_AUDIENCE_URL}
    ports:
      - 3001:3001
    depends_on:
      - sigpair
```

### 2. Backend Configuration

Configure the following environment variables in your backend:

```bash
# MPC Configuration
DISABLE_MPC=false
DUO_NODE_URL=https://interspace-duo-node-prod-PROJECT_NUMBER.us-central1.run.app
DUO_NODE_AUDIENCE_URL=https://interspace-duo-node-prod-PROJECT_NUMBER.us-central1.run.app

# For development
BYPASS_LOGIN=true  # Disables 2FA requirement
```

### 3. Database Migration

Run the migration to add MPC key mapping support:

```bash
npx prisma migrate deploy
```

## API Endpoints

### Backend MPC Endpoints

All endpoints require authentication and are rate-limited.

#### 1. Backup Key
```http
POST /api/v1/mpc/backup
Authorization: Bearer <token>

{
  "profileId": "profile123",
  "rsaPubkeyPem": "RSA PUBLIC KEY PEM",
  "label": "My Backup",
  "twoFactorCode": "123456"  // Required in production
}

Response:
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "keyId": "key123",
    "algorithm": "ecdsa",
    "verifiableBackup": "encrypted-backup-data",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 2. Export Key
```http
POST /api/v1/mpc/export
Authorization: Bearer <token>

{
  "profileId": "profile123",
  "clientEncKey": "Y2xpZW50X2VuY3J5cHRpb25fa2V5XzMyX2J5dGVzXw==",
  "twoFactorCode": "123456"  // Required in production
}

Response:
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "keyId": "key123",
    "serverPublicKey": [1, 2, 3, ...],
    "encryptedServerShare": "encrypted-share",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 3. Get Key Status
```http
GET /api/v1/mpc/status/:profileId
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "hasKey": true,
    "keyAlgorithm": "ecdsa",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "publicKey": "public-key-data"
  }
}
```

#### 4. Rotate Key
```http
POST /api/v1/mpc/rotate
Authorization: Bearer <token>

{
  "profileId": "profile123",
  "twoFactorCode": "123456"  // Required in production
}

Response:
{
  "success": true,
  "message": "Key rotation initiated",
  "data": {
    "profileId": "profile123",
    "status": "rotation_in_progress"
  }
}
```

## Security Best Practices

### 1. Authentication
- Always use service-to-service authentication between backend and duo node
- Implement 2FA for sensitive operations in production
- Never expose the duo node directly to the internet without authentication

### 2. Rate Limiting
- Backup/Export operations are limited to 10 requests per 15 minutes per IP
- General API calls are limited to 100 requests per 15 minutes

### 3. Audit Logging
All MPC operations are logged with:
- User ID and Profile ID
- Action performed (BACKUP, EXPORT, ROTATE)
- IP address and user agent
- Timestamp

### 4. Environment Separation
- Use separate duo server instances for development and production
- Never share database credentials between environments
- Use Google Secret Manager for sensitive configuration

### 5. Key Management
- Implement regular key rotation policies
- Monitor audit logs for suspicious activity
- Backup keys should be encrypted with strong RSA keys
- Export operations should be rare and heavily monitored

## Testing

### Running Tests

Backend tests:
```bash
npm test -- tests/unit/controllers/mpcController.test.ts
npm test -- tests/integration/mpc.integration.test.ts
npm test -- tests/unit/services/mpcKeyShareService.test.ts
```

Duo Node tests:
```bash
cd interspace-duo-node
npm test
```

### Test Coverage

The test suite covers:
- Controller logic and error handling
- Service layer functionality
- Integration with Silence Labs endpoints
- Authentication and authorization
- Rate limiting
- Input validation
- Error scenarios

## Monitoring

### Health Checks

1. Backend MPC health: `GET /health/mpc`
2. Duo Node health: `GET /health`

### Metrics to Monitor

1. **Response Times**: Track backup/export operation latencies
2. **Error Rates**: Monitor failed authentication and API errors
3. **Rate Limit Hits**: Track rate limit violations
4. **Audit Events**: Monitor critical operations (exports, rotations)

### Alerts

Set up alerts for:
- High error rates on MPC operations
- Unusual number of export requests
- Failed authentication attempts
- Duo server unreachable

## Troubleshooting

### Common Issues

1. **"DUO_NODE_AUDIENCE_URL is not set"**
   - Ensure the environment variable is set in both backend and duo node
   - Verify the URL matches your Cloud Run service URL

2. **"Failed to backup key: 404"**
   - Check if the key exists in the Silence Labs database
   - Verify the key ID mapping is correct

3. **Rate limit errors**
   - Implement exponential backoff for retry logic
   - Consider increasing limits for legitimate use cases

4. **Authentication failures**
   - Verify Google Cloud service account permissions
   - Check if the audience URL is correct
   - Ensure the ID token hasn't expired

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug
```

This will log:
- Request details (without sensitive data)
- Response times
- Authentication flow
- Error details

## Migration Guide

If migrating from the legacy MPC system:

1. Run database migration to add `mpc_key_mappings` table
2. Update existing key shares to include Silence Labs key IDs
3. Test backup/export functionality in staging
4. Gradually migrate users to the new system
5. Monitor audit logs during migration

## Support

For issues related to:
- **Interspace Backend**: Create an issue in the backend repository
- **Silence Labs SDK**: Contact Silence Labs support
- **Google Cloud Auth**: Check GCP documentation or support