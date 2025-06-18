# API DOCUMENTATION

**Base URL**: `https://api.interspace.fi/api/v1`  
**Version**: 1.0.0  
**Authentication**: JWT Bearer Token

## Overview

The Interspace API provides endpoints for managing MPC wallets, SmartProfiles, and cross-chain operations. All responses follow a consistent format and include proper error handling.

## Authentication

### Token-Based Auth
Most endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer eyJhbGc...
```

### Token Lifecycle
- **Access Token**: 15 minutes (default)
- **Refresh Token**: 7 days
- Tokens can be refreshed before expiry
- Blacklist on logout

## Core Endpoints

### Authentication

#### Login with MPC
```http
POST /auth/mpc/login
```
Authenticate using MPC key signature.

**Request:**
```json
{
  "publicKey": "0x04abc...",
  "signature": "0x123...",
  "message": "Login to Interspace",
  "deviceId": "device-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "mpcPublicKey": "..." },
    "tokens": {
      "accessToken": "...",
      "refreshToken": "...",
      "expiresIn": 900
    }
  }
}
```

### SmartProfiles

#### Create Profile
```http
POST /profiles
```
Create a new SmartProfile with automatic session wallet.

**Request:**
```json
{
  "name": "Trading Profile",
  "type": "TRADING",
  "imageUrl": "https://..."
}
```

#### List Profiles
```http
GET /profiles
```
Get all profiles for authenticated user.

#### Link Account
```http
POST /profiles/:profileId/accounts
```
Link external wallet to profile.

**Request:**
```json
{
  "address": "0x...",
  "walletType": "METAMASK",
  "chainId": 1,
  "signature": "0x...",
  "message": "Link account..."
}
```

### Orby Integration

#### Create Intent
```http
POST /profiles/:profileId/intent
```
Build cross-chain transaction intent.

**Request:**
```json
{
  "action": "TRANSFER",
  "params": {
    "fromChainId": 1,
    "toChainId": 137,
    "tokenAddress": "0x...",
    "amount": "1000000000",
    "recipientAddress": "0x..."
  }
}
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {} // Optional
  }
}
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| AUTH001 | Invalid credentials | 401 |
| AUTH002 | Token expired | 401 |
| AUTH003 | Insufficient permissions | 403 |
| PROFILE001 | Profile not found | 404 |
| VALIDATION001 | Invalid input | 400 |
| RATE_LIMIT | Too many requests | 429 |

## Rate Limiting

- **Authenticated**: 60 req/min, 1000 req/hour
- **Unauthenticated**: 20 req/min, 100 req/hour
- **MPC Operations**: 10 req/hour

Headers indicate limit status:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1718704800
```

## WebSocket Events (Coming Soon)

Real-time updates for:
- Transaction status
- Profile changes
- Account connections
- Gas price updates

## SDK Usage

### JavaScript/TypeScript
```typescript
import { InterspaceSDK } from '@interspace/sdk';

const sdk = new InterspaceSDK({
  baseURL: 'https://api.interspace.fi',
  apiKey: 'your-api-key'
});

// Create profile
const profile = await sdk.profiles.create({
  name: 'My Profile',
  type: 'TRADING'
});
```

### React Native
```typescript
import { InterspaceProvider } from '@interspace/react-native';

function App() {
  return (
    <InterspaceProvider config={{ baseURL: '...' }}>
      <YourApp />
    </InterspaceProvider>
  );
}
```

## Testing

### Test Environment
- **Base URL**: `https://api-dev.interspace.fi`
- **Test Tokens**: Available in dashboard
- **Rate Limits**: Relaxed for testing

### Postman Collection
Download from: `/docs/postman/interspace-api.json`

## Changelog

### v1.0.0 (2025-06-18)
- Initial release
- MPC wallet support
- SmartProfile management
- Orby integration
- Multi-device support

---

For detailed endpoint specifications, see [AI Agent API Reference](../ai-agents/AI_AGENT_API_REFERENCE.md).