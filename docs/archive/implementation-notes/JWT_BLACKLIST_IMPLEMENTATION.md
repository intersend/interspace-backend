# JWT Blacklisting and Token Rotation Implementation

## Overview

This document describes the JWT blacklisting and refresh token rotation implementation that enhances security by preventing token replay attacks and enabling immediate token revocation.

## Features Implemented

### 1. Token Blacklisting
- Database-backed blacklist for revoked tokens
- Automatic cleanup of expired blacklisted tokens
- Support for different revocation reasons (logout, rotation, security, password_change)
- Token blacklist statistics for monitoring

### 2. Refresh Token Rotation
- Token family tracking to detect token theft
- Automatic rotation on refresh token use
- Family invalidation on suspicious activity
- Prevention of refresh token replay attacks

### 3. Enhanced Security
- Middleware checks for blacklisted tokens on every request
- Audit logging for security events
- Logout from all devices functionality
- Token revocation API for security incidents

## Implementation Details

### Database Schema Changes

```sql
-- Added to refresh_tokens table
familyId  String?  -- Token family for rotation detection
rotatedAt DateTime? -- When this token was rotated

-- New blacklisted_tokens table
model BlacklistedToken {
  id         String   @id @default(cuid())
  token      String   @unique
  tokenType  String   -- "access" or "refresh"
  userId     String
  reason     String   -- "logout", "rotation", "security", "password_change"
  expiresAt  DateTime -- When the token would have expired naturally
  createdAt  DateTime @default(now())
}
```

### Token Rotation Flow

1. User logs in → New token family created
2. User refreshes token → Old token marked as rotated, new token in same family
3. If rotated token is used again → Entire family invalidated (possible theft)
4. Security event logged for monitoring

### API Endpoints

#### Logout All Devices
```http
POST /api/v1/auth/logout-all
Authorization: Bearer <access_token>
```

Invalidates all refresh tokens for the user.

#### Revoke Token
```http
POST /api/v1/auth/revoke-token
Authorization: Bearer <access_token>

{
  "token": "<token_to_revoke>",
  "tokenType": "access" | "refresh",
  "reason": "security"
}
```

Manually revoke a specific token.

#### Blacklist Statistics
```http
GET /api/v1/auth/blacklist-stats
Authorization: Bearer <access_token>
```

Returns blacklist statistics for monitoring.

## Security Benefits

1. **Immediate Token Revocation**: Tokens can be invalidated immediately without waiting for expiration
2. **Token Theft Detection**: Refresh token rotation with family tracking detects stolen tokens
3. **Comprehensive Logout**: Users can logout from all devices at once
4. **Audit Trail**: All security events are logged with integrity protection
5. **Automated Cleanup**: Expired blacklisted tokens are automatically removed

## Development Considerations

- Token blacklist checks add minimal latency (~1-2ms per request)
- Database-backed solution works across multiple server instances
- Blacklist cleanup runs hourly to prevent table bloat
- No impact on development workflow with BYPASS_LOGIN

## Monitoring

Track these metrics:
- Token blacklist size
- Revocation reasons distribution
- Token theft detection events
- Blacklist check performance

## Future Enhancements

1. **Redis Integration**: Add Redis caching for faster blacklist checks
2. **Bloom Filters**: Use probabilistic data structures for quick negative checks
3. **Token Binding**: Bind tokens to device fingerprints
4. **Anomaly Detection**: ML-based detection of suspicious token usage patterns