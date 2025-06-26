# MPC Operations API Sequence

## Overview
This document details the API sequences for Multi-Party Computation (MPC) wallet operations, including key generation, signing, rotation, and backup.

## Architecture
- **Client**: Holds P1 key share (iOS Keychain / Secure Storage)
- **Backend**: Manages P2 key share (encrypted in database)
- **Duo Node**: Proxy to Silence Labs infrastructure
- **Protocol**: 2-of-2 threshold signatures

## 1. MPC Wallet Creation

### Sequence
```
Client                          Backend                         Duo Node
  |                               |                               |
  |-- POST /api/v2/profiles ----->|                               |
  |   {                           |                               |
  |     name: "Profile Name",     |                               |
  |     clientShare: {            |                               |
  |       keyId: "...",           |                               |
  |       publicKey: "...",       |                               |
  |       share: "P1_share"       |                               |
  |     }                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Generate P2 share --------->|
  |                               |<-- P2 share + address --------|
  |                               |                               |
  |                               |-- Store encrypted P2 share    |
  |                               |   in mpcKeyShare table        |
  |                               |                               |
  |<-- 201 Created --------------|                               |
  |    {                          |                               |
  |      profileId: "...",        |                               |
  |      sessionWalletAddress:    |                               |
  |        "0x..."                |                               |
  |    }                          |                               |
```

### Implementation Details
- P1 and P2 shares are generated using Silence Labs SDK
- Key generation involves 3 rounds of message exchange
- P2 share is encrypted with AES-256-GCM before storage
- Address is derived from combined public key

## 2. Transaction Signing

### Sequence
```
Client                          Backend                         Blockchain
  |                               |                               |
  |-- POST /api/v1/profiles/     |                               |
  |   :id/transactions -------->  |                               |
  |   {                           |                               |
  |     to: "0x...",              |                               |
  |     value: "1000000",         |                               |
  |     chainId: 11155111         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Load P2 share from DB       |
  |                               |-- Create unsigned tx          |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      unsignedTx: {...},       |                               |
  |      sessionId: "..."         |                               |
  |    }                          |                               |
  |                               |                               |
  |-- Sign with P1 share          |                               |
  |                               |                               |
  |-- POST /api/v1/mpc/sign ----->|                               |
  |   {                           |                               |
  |     sessionId: "...",         |                               |
  |     p1SignatureShare: "..."   |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- MPC signing protocol        |
  |                               |   (5 rounds)                  |
  |                               |-- Combine signatures          |
  |                               |                               |
  |                               |-- Submit to blockchain ------>|
  |                               |<-- Transaction hash ----------|
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      txHash: "0x...",         |                               |
  |      status: "submitted"      |                               |
  |    }                          |                               |
```

### Signing Protocol Details
1. **Round 1**: P1 sends initial commitment
2. **Round 2**: P2 responds with its commitment
3. **Round 3**: P1 and P2 exchange shares
4. **Round 4**: Partial signatures created
5. **Round 5**: Final signature assembly

## 3. Key Rotation

### Sequence
```
Client                          Backend                         Duo Node
  |                               |                               |
  |-- POST /api/v1/mpc/          |                               |
  |   rotate-key --------------->|                               |
  |   {                           |                               |
  |     profileId: "...",         |                               |
  |     twoFactorCode: "123456"  |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Verify 2FA                  |
  |                               |-- Load existing shares        |
  |                               |                               |
  |                               |-- Key refresh protocol ------>|
  |                               |<-- New P2 share --------------|
  |                               |                               |
  |                               |-- Update encrypted share      |
  |                               |   (same address)              |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      status: "rotated",       |                               |
  |      address: "0x..." (same)  |                               |
  |    }                          |                               |
```

### Rotation Properties
- Public key and address remain unchanged
- New key shares are generated
- Old shares are invalidated
- Requires 2FA authentication

## 4. Key Backup

### Sequence
```
Client                          Backend                         Duo Node
  |                               |                               |
  |-- POST /api/v1/mpc/backup -->|                               |
  |   {                           |                               |
  |     profileId: "...",         |                               |
  |     twoFactorCode: "123456",  |                               |
  |     encryptionKey: "..."      |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Verify 2FA                  |
  |                               |-- Create backup request ------>|
  |                               |<-- Encrypted backup data -----|
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      backupId: "...",         |                               |
  |      encryptedData: "...",    |                               |
  |      verificationHash: "..."  |                               |
  |    }                          |                               |
```

## 5. Batch Signing

### Sequence
```
Client                          Backend                         Orby
  |                               |                               |
  |-- POST /api/v1/batch/        |                               |
  |   operations --------------->|                               |
  |   {                           |                               |
  |     operations: [             |                               |
  |       { type: "transfer"...}, |                               |
  |       { type: "swap"...}      |                               |
  |     ]                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Build operations via Orby ->|
  |                               |<-- Unsigned operations -------|
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      batchId: "...",          |                               |
  |      unsignedOps: [...]       |                               |
  |    }                          |                               |
  |                               |                               |
  |-- Batch sign with P1          |                               |
  |                               |                               |
  |-- POST /api/v1/mpc/          |                               |
  |   batch-sign ---------------->|                               |
  |   {                           |                               |
  |     batchId: "...",           |                               |
  |     signatures: [...]         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- MPC batch signing           |
  |                               |   (parallel processing)       |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      signedOps: [...],        |                               |
  |      executionReady: true     |                               |
  |    }                          |                               |
```

## Error Cases

### Invalid Key Share
```json
{
  "error": "INVALID_KEY_SHARE",
  "message": "Key share not found or corrupted",
  "statusCode": 400
}
```

### Signing Failure
```json
{
  "error": "MPC_SIGNING_FAILED",
  "message": "Failed to complete MPC signing protocol",
  "details": "Round 3 timeout",
  "statusCode": 500
}
```

### Network Issues
```json
{
  "error": "DUO_NODE_UNAVAILABLE",
  "message": "Cannot connect to MPC infrastructure",
  "statusCode": 503
}
```

## Security Considerations

1. **Key Storage**
   - P1 shares: Client-side secure storage only
   - P2 shares: Encrypted at rest with rotation
   - No single point of compromise

2. **Access Control**
   - Profile ownership verification
   - 2FA for sensitive operations
   - Audit logging for all MPC operations

3. **Rate Limiting**
   - Signing: 10 requests per minute
   - Key operations: 5 requests per hour
   - Backup: 3 requests per day

## Development vs Production

### Development Mode
- Uses deterministic key generation for testing
- Simplified signing protocol
- No Duo Node required

### Production Mode
- Full MPC protocol with Silence Labs
- Hardware security module integration
- Complete audit trail