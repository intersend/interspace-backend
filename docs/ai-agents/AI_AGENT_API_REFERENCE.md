# AI AGENT API REFERENCE - INTERSPACE BACKEND

**Document Type**: AI Agent API Specification  
**Version**: 1.0.0  
**Base URL**: `https://api.interspace.fi/api/v1`  
**Authentication**: Bearer Token (JWT)

## AUTHENTICATION ENDPOINTS

### 1. MPC Registration
```http
POST /auth/mpc/register
Content-Type: application/json

Request:
{
  "keyShareData": "string (base64 encoded)",
  "publicKey": "string (hex)",
  "deviceId": "string (uuid)",
  "email": "string (optional)",
  "appleId": "string (optional)",
  "googleId": "string (optional)"
}

Response (200):
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "mpcPublicKey": "0x04abc...",
      "email": "user@example.com"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "expiresIn": 900
    }
  }
}

Error Response (400):
{
  "success": false,
  "error": {
    "code": "AUTH001",
    "message": "Public key already registered"
  }
}
```

### 2. MPC Login
```http
POST /auth/mpc/login
Content-Type: application/json

Request:
{
  "publicKey": "string (hex)",
  "signature": "string (hex)",
  "message": "string",
  "deviceId": "string (uuid)"
}

Response (200):
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "mpcPublicKey": "0x04abc..."
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "expiresIn": 900
    }
  }
}
```

### 3. Token Refresh
```http
POST /auth/refresh
Content-Type: application/json

Request:
{
  "refreshToken": "string (JWT)"
}

Response (200):
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 900
  }
}
```

### 4. Social Authentication
```http
POST /auth/social/google
Content-Type: application/json

Request:
{
  "idToken": "string (Google ID token)",
  "deviceId": "string (uuid)"
}

Response (200):
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@gmail.com",
      "googleId": "1234567890"
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc..."
    },
    "isNewUser": false
  }
}
```

## SMARTPROFILE ENDPOINTS

### 1. Create Profile
```http
POST /profiles
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "name": "Trading Profile",
  "type": "TRADING", // TRADING | GAMING | DEFI | SOCIAL | NFT | DEFAULT
  "imageUrl": "https://example.com/image.png",
  "eoaAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f8f123"
}

Response (201):
{
  "success": true,
  "data": {
    "id": "prof_123456789",
    "name": "Trading Profile",
    "type": "TRADING",
    "imageUrl": "https://example.com/image.png",
    "sessionWalletAddress": "0x456...",
    "sessionWalletChainId": 1,
    "eoaAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f8f123",
    "linkedAccounts": [],
    "createdAt": "2025-06-18T10:00:00Z"
  }
}
```

### 2. List Profiles
```http
GET /profiles
Authorization: Bearer {token}

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "prof_123456789",
      "name": "Trading Profile",
      "type": "TRADING",
      "sessionWalletAddress": "0x456...",
      "linkedAccounts": [
        {
          "id": "acc_987654321",
          "address": "0x123...",
          "walletType": "METAMASK",
          "chainId": 1
        }
      ]
    }
  ]
}
```

### 3. Link Account to Profile
```http
POST /profiles/{profileId}/accounts
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f8f123",
  "walletType": "METAMASK", // METAMASK | WALLETCONNECT | COINBASE | RAINBOW
  "chainId": 1,
  "signature": "0xabc123...", // Signature proving ownership
  "message": "Link account to Interspace profile prof_123456789"
}

Response (201):
{
  "success": true,
  "data": {
    "id": "acc_987654321",
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f8f123",
    "walletType": "METAMASK",
    "chainId": 1,
    "linkedAt": "2025-06-18T10:00:00Z"
  }
}
```

## MPC OPERATIONS

### 1. Generate MPC Key
```http
POST /mpc/generate
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "deviceId": "string (uuid)",
  "metadata": {
    "platform": "ios", // ios | android | web
    "deviceName": "iPhone 15 Pro"
  }
}

Response (200):
{
  "success": true,
  "data": {
    "keyShareId": "ks_123456789",
    "publicKey": "0x04abc...",
    "keyShareData": "encrypted_base64_string",
    "createdAt": "2025-06-18T10:00:00Z"
  }
}
```

### 2. Export Key Share
```http
POST /mpc/export
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "keyShareId": "ks_123456789",
  "twoFactorCode": "123456", // Required for security
  "exportFormat": "ENCRYPTED" // ENCRYPTED | MNEMONIC
}

Response (200):
{
  "success": true,
  "data": {
    "exportData": "encrypted_export_string",
    "exportFormat": "ENCRYPTED",
    "validUntil": "2025-06-18T11:00:00Z"
  }
}
```

### 3. Rotate Key Share
```http
POST /mpc/rotate
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "currentKeyShareId": "ks_123456789",
  "newDeviceId": "string (uuid)",
  "twoFactorCode": "123456"
}

Response (200):
{
  "success": true,
  "data": {
    "newKeyShareId": "ks_987654321",
    "publicKey": "0x04def...",
    "rotatedAt": "2025-06-18T10:00:00Z",
    "oldKeyShareStatus": "REVOKED"
  }
}
```

## ORBY INTEGRATION

### 1. Create Intent
```http
POST /profiles/{profileId}/intent
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "action": "TRANSFER", // TRANSFER | SWAP
  "params": {
    "fromChainId": 1,
    "toChainId": 137,
    "tokenAddress": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "amount": "1000000000", // 1000 USDC (6 decimals)
    "recipientAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f8f123"
  }
}

Response (200):
{
  "success": true,
  "data": {
    "intentId": "int_123456789",
    "operations": [
      {
        "chainId": 1,
        "to": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "data": "0xa9059cbb...",
        "value": "0",
        "gasLimit": "100000"
      }
    ],
    "estimatedGas": {
      "total": "0.001",
      "currency": "ETH",
      "sponsored": true
    },
    "expiresAt": "2025-06-18T10:05:00Z"
  }
}
```

### 2. Get Account Cluster
```http
GET /orby/accounts/{profileId}/cluster
Authorization: Bearer {token}

Response (200):
{
  "success": true,
  "data": {
    "clusterId": "cluster_123456789",
    "accounts": [
      {
        "address": "0x123...",
        "chainId": 1,
        "balance": {
          "ETH": "1.5",
          "USDC": "1000.0"
        }
      },
      {
        "address": "0x456...",
        "chainId": 137,
        "balance": {
          "MATIC": "100.0",
          "USDC": "500.0"
        }
      }
    ],
    "totalValueUSD": "2500.00"
  }
}
```

## EMAIL VERIFICATION

### 1. Send Verification Email
```http
POST /email/send-verification
Authorization: Bearer {token}
Content-Type: application/json

Request:
{
  "email": "user@example.com"
}

Response (200):
{
  "success": true,
  "data": {
    "message": "Verification email sent",
    "expiresIn": 3600
  }
}
```

### 2. Verify Email
```http
POST /email/verify
Content-Type: application/json

Request:
{
  "token": "verification_token_from_email"
}

Response (200):
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "verified": true,
    "verifiedAt": "2025-06-18T10:00:00Z"
  }
}
```

## ERROR RESPONSES

### Standard Error Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "field": "Additional context"
    }
  }
}
```

### Common Error Codes
```json
{
  "AUTH001": "Invalid credentials",
  "AUTH002": "Token expired",
  "AUTH003": "Insufficient permissions",
  "AUTH004": "Account locked",
  "MPC001": "Key generation failed",
  "MPC002": "Invalid key share",
  "MPC003": "Key rotation failed",
  "PROFILE001": "Profile not found",
  "PROFILE002": "Duplicate profile name",
  "PROFILE003": "Maximum profiles reached",
  "ORBY001": "Chain abstraction failed",
  "ORBY002": "Insufficient balance",
  "ORBY003": "Invalid intent parameters",
  "VALIDATION001": "Invalid input format",
  "VALIDATION002": "Missing required field",
  "RATE_LIMIT": "Too many requests"
}
```

## RATE LIMITS

### Default Limits
```json
{
  "authenticated": {
    "requests_per_minute": 60,
    "requests_per_hour": 1000
  },
  "unauthenticated": {
    "requests_per_minute": 20,
    "requests_per_hour": 100
  },
  "mpc_operations": {
    "requests_per_hour": 10
  }
}
```

### Rate Limit Headers
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1718704800
```

## WEBHOOK EVENTS

### Event Types
```json
{
  "profile.created": "New profile created",
  "profile.deleted": "Profile deleted",
  "account.linked": "Account linked to profile",
  "account.unlinked": "Account unlinked",
  "transaction.completed": "Transaction confirmed",
  "mpc.key_rotated": "MPC key rotated"
}
```

### Webhook Payload
```json
{
  "event": "profile.created",
  "timestamp": "2025-06-18T10:00:00Z",
  "data": {
    "profileId": "prof_123456789",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Trading Profile"
  }
}
```

## TESTING ENDPOINTS

### Health Check
```http
GET /health

Response (200):
{
  "status": "healthy",
  "timestamp": "2025-06-18T10:00:00Z",
  "version": "1.0.0",
  "services": {
    "database": "connected",
    "redis": "connected",
    "mpc": "operational"
  }
}
```

### API Version
```http
GET /version

Response (200):
{
  "version": "1.0.0",
  "apiVersion": "v1",
  "buildDate": "2025-06-18",
  "features": [
    "mpc-wallet",
    "smart-profiles",
    "orby-integration",
    "email-verification"
  ]
}
```

---

**Usage Note**: All timestamps are in ISO 8601 format (UTC). All amounts are in smallest unit (wei for ETH, etc.). Headers must include `Content-Type: application/json` for POST requests.