# SIWE (Sign-In with Ethereum) Implementation

This document describes the Sign-In with Ethereum (EIP-4361) implementation with replay attack protection.

## Overview

Our SIWE implementation follows the EIP-4361 standard and includes:
- Nonce-based replay attack protection
- Message expiration
- Domain validation
- Timestamp verification
- Comprehensive audit logging

## API Endpoints

### 1. Generate Nonce
```http
GET /api/v1/siwe/nonce
```

Generates a unique nonce for SIWE message creation.

**Response:**
```json
{
  "success": true,
  "data": {
    "nonce": "a1b2c3d4e5f6...",
    "expiresIn": 300
  }
}
```

### 2. Create Message
```http
POST /api/v1/siwe/message
```

Creates a properly formatted SIWE message.

**Request Body:**
```json
{
  "address": "0x...",
  "chainId": 1,
  "nonce": "a1b2c3d4e5f6...",
  "statement": "Sign in to Interspace",
  "resources": ["https://interspace.wallet"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "interspace.wallet wants you to sign in..."
  }
}
```

### 3. Verify Message
```http
POST /api/v1/siwe/verify
```

Verifies a signed SIWE message.

**Request Body:**
```json
{
  "message": "interspace.wallet wants you to sign in...",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "0x...",
    "valid": true
  }
}
```

## Client Implementation

### 1. Standard SIWE Flow

```typescript
// 1. Get a nonce
const nonceResponse = await fetch('/api/v1/siwe/nonce');
const { nonce } = await nonceResponse.json();

// 2. Create message
const messageResponse = await fetch('/api/v1/siwe/message', {
  method: 'POST',
  body: JSON.stringify({
    address: walletAddress,
    chainId: 1,
    nonce,
    statement: 'Sign in to Interspace'
  })
});
const { message } = await messageResponse.json();

// 3. Sign message with wallet
const signature = await ethereum.request({
  method: 'personal_sign',
  params: [message, walletAddress]
});

// 4. Verify signature
const verifyResponse = await fetch('/api/v1/siwe/verify', {
  method: 'POST',
  body: JSON.stringify({ message, signature })
});
```

### 2. Account Linking with SIWE

When linking a wallet account, the system automatically detects SIWE messages:

```typescript
// The message will be automatically detected as SIWE
const siweMessage = createSiweMessage({
  domain: 'interspace.wallet',
  address: walletAddress,
  statement: 'Link this wallet to your Interspace profile',
  uri: window.location.href,
  version: '1',
  chainId: 1,
  nonce: nonce,
  issuedAt: new Date().toISOString()
});

// Sign and link
const signature = await signMessage(siweMessage);
await linkAccount({
  address: walletAddress,
  signature,
  message: siweMessage,
  walletType: 'metamask'
});
```

## Security Features

### 1. Replay Attack Protection
- Each nonce can only be used once
- Nonces expire after 5 minutes
- Used nonces are marked in the database

### 2. Message Validation
- Domain must match the expected domain
- Timestamp must be recent (within 10 minutes)
- Address in message must match recovered address
- Chain ID validation (optional)

### 3. Audit Logging
- All verification attempts are logged
- Failed attempts include reason codes
- Replay attempts trigger security alerts

### 4. Backward Compatibility
The system supports both:
- **SIWE Messages**: Full EIP-4361 compliance with replay protection
- **Legacy Messages**: Simple message signing (for backward compatibility)

## Message Format (EIP-4361)

```
example.com wants you to sign in with your Ethereum account:
0x1234...5678

Sign in to Interspace

URI: https://example.com
Version: 1
Chain ID: 1
Nonce: 8b5e9f2a3d
Issued At: 2024-01-15T12:00:00.000Z
Expiration Time: 2024-01-15T12:10:00.000Z
Resources:
- https://example.com/profile
- https://example.com/settings
```

## Database Schema

```sql
-- SIWE nonces table
CREATE TABLE siwe_nonces (
  id TEXT PRIMARY KEY,
  nonce TEXT UNIQUE NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW(),
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP -- NULL until used
);

-- Index for cleanup
CREATE INDEX idx_siwe_nonces_expires ON siwe_nonces(expiresAt);
```

## Monitoring

Monitor these metrics:
- Nonce generation rate
- Verification success/failure rate
- Replay attempt frequency
- Average verification time

## Best Practices

1. **Always use SIWE for new implementations**
2. **Include a meaningful statement** describing what the user is signing
3. **Set appropriate expiration times** (10 minutes recommended)
4. **Validate domain and chain ID** on the server
5. **Monitor for replay attempts** as they may indicate attacks

## Migration from Legacy

To migrate from simple message signing to SIWE:

1. Update client to generate SIWE messages
2. Server automatically detects and handles both formats
3. Monitor usage and phase out legacy support
4. Enforce SIWE-only after migration period