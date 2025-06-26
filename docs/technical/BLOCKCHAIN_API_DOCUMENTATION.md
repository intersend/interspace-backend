# Blockchain Features API Documentation

**Base URL**: `https://api.interspace.fi/api/v1`  
**Version**: 2.0.0  
**Authentication**: JWT Bearer Token

## Overview

This document covers the blockchain-specific APIs including MPC operations, Orby chain abstraction, batch operations, and EIP-7702 delegation.

## Table of Contents

1. [MPC Wallet Operations](#mpc-wallet-operations)
2. [Orby Chain Abstraction](#orby-chain-abstraction)
3. [Batch Operations](#batch-operations)
4. [EIP-7702 Delegation](#eip-7702-delegation)
5. [Error Handling](#error-handling)

---

## MPC Wallet Operations

### Create Profile with MPC Wallet

```http
POST /api/v2/profiles
```

Creates a new profile with an MPC wallet using 2-of-2 threshold signatures.

**Request:**
```json
{
  "name": "My Trading Profile",
  "clientShare": {
    "keyId": "unique-key-id",
    "publicKey": "0x04...",
    "share": "encrypted-p1-share"
  },
  "developmentMode": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "profileId": "prof_123",
    "name": "My Trading Profile",
    "sessionWalletAddress": "0x1234...5678",
    "orbyAccountClusterId": "cls_abc123"
  }
}
```

### Execute Transaction

```http
POST /api/v1/profiles/:profileId/transactions
```

Execute a transaction using the MPC wallet.

**Request:**
```json
{
  "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f62794",
  "value": "1000000000000000000",
  "data": "0x",
  "chainId": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionHash": "0xabc...",
    "chainId": 1,
    "status": "submitted"
  }
}
```

### Backup MPC Key

```http
POST /api/v1/mpc/backup
```

Create an encrypted backup of the MPC key share.

**Request:**
```json
{
  "profileId": "prof_123",
  "twoFactorCode": "123456",
  "encryptionKey": "backup-encryption-key"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupId": "bkp_456",
    "encryptedData": "...",
    "verificationHash": "0x...",
    "createdAt": "2024-06-25T10:00:00Z"
  }
}
```

### Rotate MPC Key

```http
POST /api/v1/mpc/rotate-key
```

Rotate the MPC key shares while maintaining the same address.

**Request:**
```json
{
  "profileId": "prof_123",
  "twoFactorCode": "123456"
}
```

---

## Orby Chain Abstraction

### Get Unified Balance

```http
GET /api/v1/profiles/:profileId/balance
```

Get unified token balance across all chains.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsdValue": "12345.67",
    "tokens": [
      {
        "standardizedTokenId": "eth",
        "symbol": "ETH",
        "name": "Ethereum",
        "totalAmount": "5.25",
        "totalUsdValue": "10500.00",
        "decimals": 18,
        "balancesPerChain": [
          {
            "chainId": 1,
            "chainName": "Ethereum",
            "amount": "3.5",
            "usdValue": "7000.00",
            "tokenAddress": null,
            "isNative": true
          },
          {
            "chainId": 137,
            "chainName": "Polygon",
            "amount": "1.75",
            "usdValue": "3500.00",
            "tokenAddress": null,
            "isNative": true
          }
        ]
      }
    ]
  }
}
```

### Create Transfer Intent

```http
POST /api/v1/profiles/:profileId/intent
```

Build a transfer or swap operation.

**Request (Transfer):**
```json
{
  "type": "transfer",
  "from": {
    "token": "usdc",
    "chainId": 137,
    "amount": "100"
  },
  "to": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f62794",
    "chainId": 1
  },
  "gasToken": {
    "standardizedTokenId": "usdc"
  }
}
```

**Request (Swap):**
```json
{
  "type": "swap",
  "from": {
    "token": "usdc",
    "chainId": 1,
    "amount": "100"
  },
  "to": {
    "token": "eth",
    "chainId": 1
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "operationSetId": "op_789",
    "operations": [
      {
        "index": 0,
        "chainId": 1,
        "to": "0x...",
        "value": "0",
        "data": "0x...",
        "gasLimit": "100000"
      }
    ],
    "quote": {
      "fromAmount": "100",
      "toAmount": "0.025",
      "rate": "0.00025",
      "priceImpact": "0.1%"
    }
  }
}
```

### Submit Signed Operations

```http
POST /api/v1/operations/:operationSetId/submit
```

Submit signed operations to the blockchain.

**Request:**
```json
{
  "signatures": [
    {
      "index": 0,
      "signature": "0x...",
      "signedData": "0x..."
    }
  ]
}
```

### Get Virtual Node RPC

```http
GET /api/v1/profiles/:profileId/orby-rpc-url?chainId=1
```

Get the Orby virtual node RPC URL for a specific chain.

**Response:**
```json
{
  "success": true,
  "data": {
    "rpcUrl": "https://virtual-node.orby.network/..."
  }
}
```

---

## Batch Operations

### Create Batch Intent

```http
POST /api/v1/profiles/:profileId/batch-intent
```

Create a batch of multiple operations.

**Request:**
```json
{
  "operations": [
    {
      "type": "transfer",
      "from": {
        "token": "eth",
        "chainId": 1,
        "amount": "0.1"
      },
      "to": {
        "address": "0x..."
      }
    },
    {
      "type": "swap",
      "from": {
        "token": "usdc",
        "chainId": 1,
        "amount": "100"
      },
      "to": {
        "token": "dai"
      }
    }
  ],
  "atomicExecution": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "batch_123",
    "operations": [
      {
        "operationSetId": "op_1",
        "type": "transfer",
        "status": "created",
        "unsignedOps": [...]
      },
      {
        "operationSetId": "op_2",
        "type": "swap",
        "status": "created",
        "unsignedOps": [...]
      }
    ]
  }
}
```

### Execute Batch

```http
POST /api/v1/batch/:batchId/execute
```

Execute a batch with signed operations.

**Request:**
```json
{
  "signatures": [
    {
      "operationSetId": "op_1",
      "signatures": [...]
    },
    {
      "operationSetId": "op_2",
      "signatures": [...]
    }
  ]
}
```

### Get Batch Status

```http
GET /api/v1/batch/:batchId/status
```

Get the current status of a batch operation.

**Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "batch_123",
    "status": "completed",
    "summary": {
      "total": 2,
      "successful": 2,
      "failed": 0,
      "pending": 0
    },
    "operations": [...]
  }
}
```

---

## EIP-7702 Delegation

### Create Delegation Authorization

```http
POST /api/v1/profiles/:profileId/accounts/:accountId/delegate
```

Create an EIP-7702 delegation authorization.

**Request:**
```json
{
  "permissions": {
    "transfer": true,
    "swap": true,
    "approve": false
  },
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authorizationData": {
      "chainId": 1,
      "address": "0xSessionWallet...",
      "nonce": "1234567890"
    },
    "messageToSign": "0x05..."
  }
}
```

### Confirm Delegation

```http
POST /api/v1/profiles/:profileId/accounts/:accountId/delegate/confirm
```

Confirm a delegation with the signed authorization.

**Request:**
```json
{
  "signature": "0x...",
  "authorizationData": {
    "chainId": 1,
    "address": "0xSessionWallet...",
    "nonce": "1234567890"
  }
}
```

### Execute Delegated Transaction

```http
POST /api/v1/profiles/:profileId/execute-delegated
```

Execute a gas-free transaction using delegation.

**Request:**
```json
{
  "delegationId": "del_456",
  "transaction": {
    "to": "0xRecipient...",
    "value": "1000000000000000000",
    "data": "0x"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "txHash": "0x...",
    "executedBy": "0xSessionWallet...",
    "onBehalfOf": "0xEOA...",
    "gasPaidBy": "session"
  }
}
```

### List Active Delegations

```http
GET /api/v1/profiles/:profileId/delegations
```

Get all active delegations for a profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "delegations": [
      {
        "id": "del_456",
        "account": {
          "address": "0xEOA...",
          "name": "Trading Wallet"
        },
        "permissions": {
          "transfer": true,
          "swap": true,
          "approve": false
        },
        "createdAt": "2024-06-01T10:00:00Z",
        "expiresAt": "2024-12-31T23:59:59Z",
        "isActive": true
      }
    ]
  }
}
```

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Not enough USDC on Polygon",
    "details": {
      "required": "100",
      "available": "50",
      "token": "usdc",
      "chainId": 137
    }
  }
}
```

### Common Error Codes

- `INVALID_REQUEST` - Request validation failed
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `INSUFFICIENT_BALANCE` - Not enough tokens
- `MPC_SIGNING_FAILED` - MPC signature generation failed
- `DELEGATION_EXPIRED` - Delegation has expired
- `OPERATION_FAILED` - Blockchain operation failed
- `RATE_LIMIT_EXCEEDED` - Too many requests

### Rate Limits

- Balance queries: 60/minute
- Transaction operations: 20/minute
- Batch operations: 5/minute
- MPC key operations: 5/hour

---

## WebSocket Events

Real-time updates are available via WebSocket:

```javascript
// Connect
const socket = io('wss://api.interspace.fi', {
  auth: { token: 'jwt-token' }
});

// Subscribe to operation updates
socket.on('operation:status', (data) => {
  console.log('Operation status:', data);
});

// Subscribe to balance updates
socket.on('balance:update', (data) => {
  console.log('Balance updated:', data);
});
```

---

## SDK Usage

```typescript
import { InterspaceSDK } from '@interspace/sdk';

const sdk = new InterspaceSDK({
  apiKey: 'your-api-key',
  environment: 'production'
});

// Get unified balance
const balance = await sdk.profiles.getBalance(profileId);

// Execute cross-chain transfer
const operation = await sdk.operations.createTransfer({
  profileId,
  from: { token: 'usdc', chainId: 137, amount: '100' },
  to: { address: '0x...', chainId: 1 }
});

// Sign and submit
const signatures = await sdk.mpc.signOperations(operation.operations);
const result = await sdk.operations.submit(operation.operationSetId, signatures);
```