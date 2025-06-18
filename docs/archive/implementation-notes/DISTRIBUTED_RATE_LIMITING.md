# Distributed Rate Limiting Implementation

## Overview

This document describes the distributed rate limiting implementation that provides consistent rate limiting across multiple server instances using Redis.

## Features

### 1. Redis-Based Rate Limiting
- Consistent rate limiting across all server instances
- Automatic fallback to in-memory rate limiting if Redis is unavailable
- Sliding window algorithm for accurate rate limiting
- Per-endpoint customizable limits

### 2. Flexible Configuration
- Environment-based Redis configuration
- Support for Redis URL or individual connection parameters
- Optional feature - can be disabled entirely
- Development-friendly with increased limits

### 3. Rate Limit Headers
- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when limit resets
- `Retry-After`: Seconds to wait when rate limited

## Configuration

### Environment Variables

```bash
# Enable distributed rate limiting
REDIS_ENABLED=true

# Option 1: Use Redis URL (recommended for cloud services)
REDIS_URL=redis://username:password@hostname:port/database

# Option 2: Use individual parameters
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0

# Rate limiting configuration
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### Rate Limit Tiers

1. **API Rate Limit** (General endpoints)
   - Production: 100 requests per 15 minutes
   - Development: 500 requests per 15 minutes

2. **Auth Rate Limit** (Authentication endpoints)
   - Production: 20 requests per 15 minutes with 1-hour block
   - Development: 500 requests per 15 minutes

3. **Transaction Rate Limit** (Sensitive operations)
   - Production: 100 requests per 15 minutes
   - Development: 1000 requests per 15 minutes

## Usage

### Basic Usage

The rate limiting is automatically applied to all routes:

```typescript
// Automatically uses distributed rate limiting if Redis is enabled
app.use(distributedApiRateLimit);
```

### Endpoint-Specific Rate Limiting

Create custom rate limits for specific endpoints:

```typescript
import { createEndpointRateLimiter } from '@/middleware/distributedRateLimiter';

// Create a strict rate limiter for password reset
const passwordResetLimiter = createEndpointRateLimiter('password-reset', 3, 3600); // 3 attempts per hour

router.post('/reset-password', passwordResetLimiter, resetPasswordController);
```

### User-Based Rate Limiting

Rate limit by user ID instead of IP:

```typescript
export const distributedUserRateLimit = createRateLimitMiddleware(
  distributedApiLimiter,
  (req: Request) => req.user?.userId || req.ip || 'unknown'
);
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │   Client    │     │   Client    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Server 1   │     │  Server 2   │     │  Server 3   │
│             │     │             │     │             │
│ Rate Limiter│     │ Rate Limiter│     │ Rate Limiter│
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    │             │
                    │  Rate Limit │
                    │   Counters  │
                    └─────────────┘
```

## Monitoring

### Health Check

The `/health/detailed` endpoint includes Redis status:

```json
{
  "redis": {
    "status": "healthy",
    "responseTime": "2ms",
    "enabled": true
  }
}
```

### Rate Limit Violations

Rate limit violations are logged with details:

```
Rate limit exceeded {
  key: "user_123",
  endpoint: "/api/v1/mpc/export",
  method: "POST"
}
```

## Development vs Production

### Development Mode
- 5x higher rate limits for easier testing
- No blocking after limit exceeded
- Verbose logging of rate limit configuration

### Production Mode
- Strict rate limits
- 1-hour block for auth endpoints after limit exceeded
- Minimal logging for performance

## Fallback Behavior

If Redis is unavailable:
1. Automatically falls back to in-memory rate limiting
2. Logs warning about fallback mode
3. Each server instance maintains its own counters
4. No service disruption

## Performance Considerations

- Redis operations add ~1-3ms latency per request
- Connection pooling minimizes overhead
- Lazy connection prevents startup delays
- Automatic retry with exponential backoff

## Future Enhancements

1. **Rate Limit Profiles**: Different limits for different user tiers
2. **Dynamic Rate Limiting**: Adjust limits based on system load
3. **IP Whitelist**: Bypass rate limiting for trusted IPs
4. **Rate Limit Analytics**: Track and visualize rate limit patterns