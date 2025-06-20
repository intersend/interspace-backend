# Docker V2 Migration Guide

## Overview

This guide explains how to configure Docker environments for the V2 Flat Identity Model in Interspace.

## Environment Variables

The following new environment variables control V2 behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_V2_API` | `true` | Enables V2 API endpoints at `/api/v2/*` |
| `AUTO_CREATE_PROFILE` | `true` | Automatically creates "My Smartprofile" for new users |
| `DEFAULT_PRIVACY_MODE` | `linked` | Default privacy mode for new accounts (linked/partial/isolated) |

## Docker Compose Configuration

### Development (docker-compose.dev.yml)

```yaml
environment:
  # V2 API Settings
  - ENABLE_V2_API=true
  - AUTO_CREATE_PROFILE=true
  - DEFAULT_PRIVACY_MODE=linked
```

### Production (docker-compose.yml)

```yaml
environment:
  # V2 API Settings
  - ENABLE_V2_API=${ENABLE_V2_API:-true}
  - AUTO_CREATE_PROFILE=${AUTO_CREATE_PROFILE:-true}
  - DEFAULT_PRIVACY_MODE=${DEFAULT_PRIVACY_MODE:-linked}
```

## Running Different Modes

### V2 Mode (Default - Flat Identity)
```bash
# Using default settings
docker-compose up

# Or explicitly
ENABLE_V2_API=true docker-compose up
```

### V1 Mode (Legacy - Hierarchical)
```bash
ENABLE_V2_API=false AUTO_CREATE_PROFILE=false docker-compose up
```

### Mixed Mode (Both APIs Available)
```bash
# V2 enabled but no auto-profile creation
ENABLE_V2_API=true AUTO_CREATE_PROFILE=false docker-compose up
```

## Fresh Database Setup

For V2, start with a fresh database:

```bash
# Stop existing containers
docker-compose down

# Remove existing data
docker volume rm interspace-backend_postgres-data

# Start fresh
docker-compose up

# Run migrations
docker exec interspace-backend npm run prisma:migrate:deploy
```

## Testing V2 Endpoints

### Check API Status
```bash
# Root endpoint shows V2 status
curl http://localhost:3000/

# V1 endpoints
curl http://localhost:3000/api/v1/auth/test

# V2 endpoints
curl http://localhost:3000/api/v2/auth/test
```

### Test Authentication
```bash
# V2 wallet auth (creates account + profile automatically)
curl -X POST http://localhost:3000/api/v2/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "wallet",
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "signature": "0xsignature",
    "message": "Sign this message",
    "walletType": "metamask"
  }'
```

## Environment-Specific Settings

### Local Development
- V2 enabled by default
- Auto profile creation enabled
- Permissive CORS for testing

### Staging
- V2 enabled
- Test privacy modes
- Monitor performance

### Production
- V2 enabled after testing
- Strict CORS policies
- Monitor account creation rates

## Rollback Plan

To rollback to V1:

1. Update environment:
```bash
ENABLE_V2_API=false
AUTO_CREATE_PROFILE=false
```

2. Restart services:
```bash
docker-compose restart app
```

3. iOS app uses V1 endpoints:
```swift
static let baseURL = "http://localhost:3000/api/v1"
```

## Monitoring

Check V2 adoption:
```bash
# View logs
docker logs interspace-backend

# Check database
docker exec interspace-backend npm run prisma:studio
```

## Troubleshooting

### V2 endpoints not available
- Check `ENABLE_V2_API=true` in environment
- Verify in logs: "✅ V2 API endpoints enabled at /api/v2"

### Auto profile not creating
- Check `AUTO_CREATE_PROFILE=true`
- Verify database migrations are applied

### Wrong privacy mode
- Check `DEFAULT_PRIVACY_MODE` value
- Must be: linked, partial, or isolated