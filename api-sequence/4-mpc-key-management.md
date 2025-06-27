# MPC Key Management

## Table of Contents
1. [Overview](#overview)
2. [Backup Key](#backup-key)
3. [Export Key](#export-key)
4. [Get Key Status](#get-key-status)
5. [Rotate Key](#rotate-key)
6. [Security Considerations](#security-considerations)

---

## Overview

The MPC (Multi-Party Computation) Key Management API provides secure operations for managing cryptographic keys using Silence Labs' MPC technology. These endpoints handle critical security operations including key backup, export, status checks, and rotation.

### Key Features
- All critical operations require 2FA in production
- Enhanced rate limiting for security-sensitive operations
- Comprehensive audit logging for all key operations
- Profile-based key isolation

### Authentication
All endpoints require authentication using `authenticateAccount` middleware with additional security layers:
- Standard auth rate limiting (`authRateLimit`)
- Transaction-specific rate limiting (`transactionRateLimit`) for critical operations
- Active profile requirement for status checks

### Base URL
```
/api/v2/mpc
```

---

## Backup Key

Generates a verifiable backup of the server's keyshare. This allows users to recover their keys in case of emergencies while maintaining security through RSA encryption.

### Request
```
POST /api/v2/mpc/backup
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "profileId": "profile123",
  "rsaPubkeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
  "label": "My Secure Backup - Jan 2024",
  "twoFactorCode": "123456"  // Required in production
}
```

#### Validation Rules
- `profileId`: Required, string (must be owned by authenticated account)
- `rsaPubkeyPem`: Required, string, min length 100 (RSA public key in PEM format)
- `label`: Required, string, max length 255
- `twoFactorCode`: Optional in development, required in production, 6 digits

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "keyId": "key_abc123",
    "algorithm": "ECDSA_SECP256K1",
    "verifiableBackup": {
      "encryptedShare": "base64_encrypted_data...",
      "proof": "cryptographic_proof...",
      "metadata": {
        "label": "My Secure Backup - Jan 2024",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    },
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Error Responses
- **400 Bad Request**: Invalid request parameters
- **404 Not Found**: Profile not found or no MPC key exists
- **403 Forbidden**: 2FA verification failed or abuse detected
- **429 Too Many Requests**: Rate limit exceeded

### Sequence
```
Client                          Backend                         Database                    Silence Labs
  |                               |                                |                            |
  |-- POST /api/v2/mpc/backup --->|                                |                            |
  |                               |-- Verify profile ownership --->|                            |
  |                               |-- Get MPC key mapping -------->|                            |
  |                               |-- Verify 2FA ---------------->|                            |
  |                               |-- Check abuse patterns ------->|                            |
  |                               |                                |-- Generate backup -------->|
  |                               |                                |<-- Encrypted backup -------|
  |                               |-- Create audit log ----------->|                            |
  |<-- 200 OK --------------------|                                |                            |
```

---

## Export Key

Exports the full private key of the MPC wallet. This is a critical operation that reconstructs the complete private key from the MPC shares.

### Request
```
POST /api/v2/mpc/export
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "profileId": "profile123",
  "clientEncKey": "base64_encoded_32_byte_key",  // 44 chars when base64 encoded
  "twoFactorCode": "123456"  // Required in production
}
```

#### Validation Rules
- `profileId`: Required, string (must be owned by authenticated account)
- `clientEncKey`: Required, base64 string, exactly 44 characters (32 bytes base64 encoded)
- `twoFactorCode`: Optional in development, required in production, 6 digits

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "keyId": "key_abc123",
    "serverPublicKey": "base64_server_public_key",
    "encryptedServerShare": "base64_encrypted_server_share",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Error Responses
- **400 Bad Request**: Invalid request parameters
- **404 Not Found**: Profile not found or no MPC key exists
- **403 Forbidden**: 2FA verification failed or abuse detected
- **429 Too Many Requests**: Rate limit exceeded

### Security Notes
- The exported key is encrypted with the client's encryption key
- The client must combine their share with the server's share to reconstruct the full key
- This operation is logged as a critical security event
- Abuse monitoring is triggered after this operation

---

## Get Key Status

Retrieves the status and metadata of an MPC key for a profile.

### Request
```
GET /api/v2/mpc/status/:profileId
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile to check

#### Additional Requirements
- Requires active profile (`requireActiveProfile` middleware)

### Response

#### Success (200 OK) - Key Exists
```json
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "hasKey": true,
    "keyAlgorithm": "ECDSA_SECP256K1",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "publicKey": "0x1234...abcd"
  }
}
```

#### Success (200 OK) - No Key
```json
{
  "success": true,
  "data": {
    "profileId": "profile123",
    "hasKey": false,
    "keyAlgorithm": null,
    "createdAt": null,
    "publicKey": null
  }
}
```

#### Error Responses
- **400 Bad Request**: Missing profile ID
- **404 Not Found**: Profile not found or access denied

---

## Rotate Key

Initiates key rotation for a profile. This triggers the key refresh protocol to generate new key shares while maintaining the same public key/address.

### Request
```
POST /api/v2/mpc/rotate
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "profileId": "profile123",
  "twoFactorCode": "123456"  // Required in production
}
```

#### Validation Rules
- `profileId`: Required, string (must be owned by authenticated account)
- `twoFactorCode`: Optional in development, required in production, 6 digits

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Key rotation initiated",
  "data": {
    "profileId": "profile123",
    "status": "rotation_in_progress"
  }
}
```

#### Error Responses
- **400 Bad Request**: Invalid request parameters
- **404 Not Found**: Profile not found or access denied
- **403 Forbidden**: 2FA verification failed
- **429 Too Many Requests**: Rate limit exceeded

### Implementation Note
The key rotation process involves:
1. Initiating key refresh protocol with Silence Labs
2. Coordinating with client for new shares generation
3. Updating the key mapping in database
4. Invalidating old shares

---

## Security Considerations

### Two-Factor Authentication
- Required for all write operations (backup, export, rotate) in production
- Validates against user's registered 2FA method
- Operation-specific 2FA challenges prevent replay attacks

### Rate Limiting
All endpoints use strict rate limiting with two layers:
1. **Auth Rate Limiter**: Standard authentication rate limits
2. **Transaction Rate Limiter**: Additional limits for critical operations (backup, export, rotate)

Example rate limits:
- Backup: 3 requests per hour per account
- Export: 2 requests per hour per account
- Rotate: 1 request per day per account

### Audit Logging
All operations are logged with:
```json
{
  "userId": "account123",
  "profileId": "profile123",
  "action": "MPC_KEY_BACKUP",
  "resource": "mpc_key",
  "details": {
    "keyId": "key_abc123",
    "label": "My Secure Backup",
    "algorithm": "ECDSA_SECP256K1",
    "severity": "critical"  // for export operations
  },
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

### Abuse Detection
The security monitoring service tracks:
- Frequency of MPC operations per account
- Patterns of suspicious activity
- Geographic anomalies
- Time-based access patterns

### Profile Isolation
- Each profile has its own MPC key
- Keys are never shared between profiles
- Profile ownership is verified for every operation
- Account-to-profile relationships are validated

---

## Error Handling

All endpoints follow consistent error response format:
```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

Common error scenarios:
- **Profile Access**: User doesn't own the specified profile
- **Key Not Found**: Profile doesn't have an MPC key initialized
- **2FA Required**: Production environment requires 2FA code
- **Rate Limited**: Too many requests in time window
- **Validation Failed**: Request parameters don't meet requirements