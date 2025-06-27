# Sign-In with Ethereum (SIWE) Authentication

## Table of Contents
1. [Overview](#overview)
2. [Generate Nonce](#generate-nonce)
3. [Create Message](#create-message)
4. [Verify Message](#verify-message)
5. [Authenticate](#authenticate)
6. [SIWE Flow Integration](#siwe-flow-integration)
7. [Security Considerations](#security-considerations)

---

## Overview

The Sign-In with Ethereum (SIWE) API implements [EIP-4361](https://eips.ethereum.org/EIPS/eip-4361) standard for authenticating users with their Ethereum wallets. This provides a secure, decentralized authentication method without passwords.

### Key Features
- EIP-4361 compliant message format
- Nonce-based replay attack prevention
- Signature verification
- JWT token generation upon successful authentication
- Support for multiple wallet providers
- Chain ID validation

### Authentication
SIWE endpoints use auth rate limiting but do not require authentication (they are used to establish authentication).

### Base URL
```
/api/v2/siwe
```

---

## Generate Nonce

Generates a unique nonce for SIWE message creation. The nonce prevents replay attacks and expires after 5 minutes.

### Request
```
GET /api/v2/siwe/nonce
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "nonce": "abc123def456ghi789",
    "expiresIn": 300  // 5 minutes in seconds
  }
}
```

### Nonce Properties
- Cryptographically secure random string
- Unique per request
- Expires after 5 minutes
- Must be used in subsequent message creation

---

## Create Message

Creates a properly formatted SIWE message according to EIP-4361 specification.

### Request
```
POST /api/v2/siwe/message
Content-Type: application/json
```

#### Request Body
```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "chainId": 1,
  "nonce": "abc123def456ghi789",
  "statement": "Sign in to Interspace",  // optional
  "resources": [  // optional
    "https://interspace.fi/profile/123",
    "https://interspace.fi/wallet/456"
  ]
}
```

#### Validation Rules
- `address`: Required, valid Ethereum address (40 hex chars with 0x prefix)
- `chainId`: Required, number
- `nonce`: Required, must be valid and not expired
- `statement`: Optional, custom statement for the message
- `resources`: Optional, array of URIs the user is authorizing

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "message": "interspace.wallet wants you to sign in with your Ethereum account:\n0x1234567890abcdef1234567890abcdef12345678\n\nSign in to Interspace\n\nURI: https://api.interspace.fi/api/v2/siwe/message\nVersion: 1\nChain ID: 1\nNonce: abc123def456ghi789\nIssued At: 2024-01-01T00:00:00.000Z\nExpiration Time: 2024-01-01T00:10:00.000Z"
  }
}
```

### Message Format
The message follows EIP-4361 format:
```
${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainId}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}
Resources:
- ${resources[0]}
- ${resources[1]}
```

---

## Verify Message

Verifies a signed SIWE message without creating a session. Useful for testing or validation purposes.

### Request
```
POST /api/v2/siwe/verify
Content-Type: application/json
```

#### Request Body
```json
{
  "message": "interspace.wallet wants you to sign in...",
  "signature": "0xabc123def456..."
}
```

#### Validation Rules
- `message`: Required, complete SIWE message
- `signature`: Required, hex-encoded signature

### Response

#### Success (200 OK) - Valid
```json
{
  "success": true,
  "data": {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "valid": true
  }
}
```

#### Error (401 Unauthorized) - Invalid
```json
{
  "success": false,
  "error": "Invalid signature"
}
```

### Verification Process
1. Parse SIWE message
2. Recover signer address from signature
3. Validate domain matches expected
4. Check nonce validity
5. Verify timestamp constraints
6. Confirm chain ID if specified

---

## Authenticate

Verifies a SIWE message and creates an authenticated session with JWT tokens.

### Request
```
POST /api/v2/siwe/authenticate
Content-Type: application/json
```

#### Request Body
```json
{
  "message": "interspace.wallet wants you to sign in...",
  "signature": "0xabc123def456...",
  "address": "0x1234567890abcdef1234567890abcdef12345678",
  "deviceId": "device123",  // optional
  "deviceName": "John's iPhone",  // optional
  "deviceType": "ios"  // optional: "ios" | "android" | "web"
}
```

#### Validation Rules
- `message`: Required, complete SIWE message
- `signature`: Required, hex-encoded signature
- `address`: Required, Ethereum address (must match recovered address)
- `deviceId`: Optional, for device tracking
- `deviceName`: Optional, defaults to "Unknown Device"
- `deviceType`: Optional, defaults to "web"

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "userEmail": null,
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "deviceId": "device123",
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678"
  },
  "message": "Authentication successful"
}
```

#### Error Responses
- **400 Bad Request**: Missing required fields
- **401 Unauthorized**: Invalid signature or message

### Authentication Flow
```
Client                          Backend                         Database
  |                               |                                |
  |-- GET /siwe/nonce ----------->|                                |
  |<-- nonce ---------------------|                                |
  |                               |                                |
  |-- Sign message with wallet -->|                                |
  |                               |                                |
  |-- POST /siwe/authenticate --->|                                |
  |                               |-- Verify signature ----------->|
  |                               |-- Find/Create User ----------->|
  |                               |-- Create Session ------------->|
  |                               |-- Generate JWT --------------->|
  |<-- JWT tokens ----------------|                                |
```

---

## SIWE Flow Integration

### Complete Authentication Flow

1. **Get Nonce**
```javascript
const nonceResponse = await fetch('/api/v2/siwe/nonce');
const { nonce } = await nonceResponse.json().data;
```

2. **Create Message**
```javascript
const messageResponse = await fetch('/api/v2/siwe/message', {
  method: 'POST',
  body: JSON.stringify({
    address: walletAddress,
    chainId: 1,
    nonce: nonce,
    statement: 'Sign in to Interspace'
  })
});
const { message } = await messageResponse.json().data;
```

3. **Sign Message**
```javascript
// Using ethers.js or web3.js
const signature = await signer.signMessage(message);
```

4. **Authenticate**
```javascript
const authResponse = await fetch('/api/v2/siwe/authenticate', {
  method: 'POST',
  body: JSON.stringify({
    message,
    signature,
    address: walletAddress,
    deviceType: 'web'
  })
});
const { accessToken, refreshToken } = await authResponse.json().data;
```

### Integration with V2 Authentication

SIWE can also be used through the unified authentication endpoint:

```
POST /api/v2/auth/authenticate
{
  "strategy": "wallet",
  "walletAddress": "0x...",
  "message": "...",
  "signature": "0x...",
  "walletType": "metamask"
}
```

See [Authentication Flows Documentation](./1-authentication-flows.md#wallet-siwe-authentication) for details.

---

## Security Considerations

### Nonce Security
- Nonces are single-use to prevent replay attacks
- 5-minute expiration window
- Stored in cache/database with TTL
- Cryptographically secure generation

### Signature Verification
- ECDSA signature recovery
- Address matching validation
- Domain verification prevents phishing
- Chain ID validation prevents cross-chain replay

### Session Security
- JWT tokens with standard expiration
- Device tracking for security monitoring
- IP and user agent logging
- Audit trail for all authentications

### Best Practices
1. Always use fresh nonces
2. Verify domain matches your application
3. Include chain ID to prevent cross-chain attacks
4. Use HTTPS in production
5. Implement proper error handling for wallet interactions

---

## Error Handling

### Common Errors

#### Invalid Nonce
```json
{
  "success": false,
  "error": "Invalid or expired nonce"
}
```

#### Signature Mismatch
```json
{
  "success": false,
  "error": "Signature does not match message"
}
```

#### Address Mismatch
```json
{
  "success": false,
  "error": "Recovered address does not match provided address"
}
```

#### Expired Message
```json
{
  "success": false,
  "error": "Message has expired"
}
```

---

## Wallet Support

SIWE works with any Ethereum wallet that supports message signing:
- MetaMask
- WalletConnect
- Coinbase Wallet
- Rainbow
- Trust Wallet
- Hardware wallets (Ledger, Trezor)
- And many more...

The wallet type can be specified during authentication for tracking purposes but doesn't affect the verification process.