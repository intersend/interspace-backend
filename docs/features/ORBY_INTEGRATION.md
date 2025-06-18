# Orby Chain Abstraction Integration - Complete Implementation

## Overview
The Orby integration for Interspace is now complete. This document provides a comprehensive overview of how Orby wraps profile accounts into clusters and abstracts gas, token, and chain complexity for users.

## Architecture

```
User Profile (Session Wallet + Linked EOAs)
    ↓
Orby Account Cluster (Virtual Unification)
    ↓
Virtual Nodes (Per Chain)
    ↓
Seamless Cross-Chain Transactions
```

## How It Works

### 1. Profile Creation Flow
When a user creates a SmartProfile:
1. A session wallet (ERC-7702 proxy) is created
2. An Orby account cluster is automatically created
3. The cluster initially contains just the session wallet
4. Ready for chain abstraction immediately

```typescript
// In SmartProfileService.createProfile()
const clusterId = await orbyService.createOrGetAccountCluster(updatedProfile);
```

### 2. Account Linking Flow
When users link accounts (MetaMask, Coinbase, etc.):
1. Account is added to the profile
2. Orby cluster is updated to include the new account
3. All accounts work as one unified wallet

```typescript
// Automatically handled when accounts are linked/unlinked
await orbyService.updateAccountCluster(profileId);
```

### 3. Transaction Flow
When users want to make a transaction:
1. Frontend calls `/intent` with simple parameters
2. Backend uses Orby to figure out the best route
3. Operations are built abstracting all complexity
4. Frontend signs with session wallet
5. Backend executes through Orby

## API Endpoints

### 1. Get Unified Balance
```http
GET /api/v1/profiles/:id/balance
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "profileId": "clxxx",
    "profileName": "Gaming",
    "unifiedBalance": {
      "totalUsdValue": "1250.50",
      "tokens": [{
        "standardizedTokenId": "usdc",
        "symbol": "USDC",
        "name": "USD Coin",
        "totalAmount": "1000000000", // across all chains/accounts
        "totalUsdValue": "1000.00",
        "decimals": 6,
        "balancesPerChain": [{
          "chainId": 1,
          "chainName": "Ethereum",
          "amount": "500000000",
          "tokenAddress": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          "isNative": false
        }, {
          "chainId": 137,
          "chainName": "Polygon",
          "amount": "500000000",
          "tokenAddress": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
          "isNative": false
        }]
      }]
    },
    "gasAnalysis": {
      "suggestedGasToken": {
        "tokenId": "usdc",
        "symbol": "USDC",
        "score": 85
      },
      "nativeGasAvailable": [{
        "chainId": 1,
        "amount": "50000000000000000", // 0.05 ETH
        "symbol": "ETH"
      }],
      "availableGasTokens": [/* top 5 tokens */]
    }
  }
}
```

### 2. Create Transaction Intent
```http
POST /api/v1/profiles/:id/intent
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "transfer", // or "swap"
  "from": {
    "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
    "chainId": 1,
    "amount": "100000000" // 100 USDC
  },
  "to": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fA5e" // for transfer
    // OR
    "token": "0x...", // for swap
    "chainId": 137 // optional for cross-chain
  },
  "gasToken": { // optional - auto-selected if not provided
    "standardizedTokenId": "usdc",
    "tokenSources": [{
      "chainId": 1,
      "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    }]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "intentId": "int_xxx",
    "operationSetId": "op_xxx",
    "type": "transfer",
    "status": "created",
    "estimatedTimeMs": 30000,
    "unsignedOperations": {
      "status": "SUCCESS",
      "intents": [{
        "type": "ONCHAIN_OPERATION",
        "format": "TRANSACTION",
        "from": "0x123...", // Session wallet
        "to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "chainId": "1",
        "data": "0x23b872dd...", // transferFrom encoded
        "value": "0",
        "nonce": "5",
        "gasLimit": "100000"
      }],
      "estimatedTimeInMs": 30000
    },
    "summary": {
      "from": {
        "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "chainId": 1,
        "amount": "100000000"
      },
      "to": {
        "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fA5e"
      },
      "gasToken": "usdc"
    }
  }
}
```

### 3. Submit Signed Operations
```http
POST /api/v1/operations/:operationSetId/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "signedOperations": [{
    "index": 0,
    "signature": "0x...",
    "signedData": "0x..." // for typed data
  }]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "operationSetId": "op_xxx",
    "status": "submitted",
    "message": "Operations submitted successfully. Use status endpoint to track progress."
  }
}
```

### 4. Check Operation Status
```http
GET /api/v1/operations/:operationSetId/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "operationSetId": "op_xxx",
    "status": "successful", // or "pending", "failed"
    "type": "transfer",
    "createdAt": "2024-06-05T14:00:00Z",
    "completedAt": "2024-06-05T14:00:30Z",
    "transactions": [{
      "chainId": 1,
      "hash": "0x...",
      "status": "confirmed",
      "gasUsed": "85000"
    }]
  }
}
```

### 5. Get Transaction History
```http
GET /api/v1/profiles/:id/transactions?page=1&limit=20&status=successful
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [{
      "operationSetId": "op_xxx",
      "type": "transfer",
      "status": "successful",
      "from": {
        "token": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "chainId": 1,
        "amount": "100000000"
      },
      "to": {
        "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f8fA5e"
      },
      "gasToken": "usdc",
      "createdAt": "2024-06-05T14:00:00Z",
      "completedAt": "2024-06-05T14:00:30Z",
      "transactions": [{
        "chainId": 1,
        "hash": "0x...",
        "status": "confirmed",
        "gasUsed": "85000"
      }]
    }],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 6. Get Available Gas Tokens
```http
GET /api/v1/profiles/:id/gas-tokens
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "availableTokens": [{
      "tokenId": "usdc",
      "symbol": "USDC",
      "name": "USD Coin",
      "score": 85,
      "totalBalance": "1000000000",
      "totalUsdValue": "1000.00",
      "availableChains": [1, 137, 42161],
      "isNative": false,
      "factors": {
        "balanceScore": 80,
        "efficiencyScore": 80,
        "availabilityScore": 100,
        "preferenceScore": 100
      }
    }],
    "suggestedToken": {/* same structure */},
    "nativeGasAvailable": [{
      "chainId": 1,
      "amount": "50000000000000000",
      "symbol": "ETH"
    }]
  }
}
```

### 7. Set Gas Token Preference
```http
POST /api/v1/profiles/:id/gas-tokens/preference
Authorization: Bearer <token>
Content-Type: application/json

{
  "standardizedTokenId": "usdc",
  "tokenSymbol": "USDC",
  "chainPreferences": {
    "1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "137": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
  }
}
```

## Key Features Implemented

### 1. **One-Click Transactions**
- No token approvals needed
- Session wallet handles all operations
- Seamless dApp interactions

### 2. **Gas Abstraction**
- Automatic gas token selection
- Use any token for gas fees
- Smart gas token recommendations

### 3. **Chain Abstraction**
- Unified balance across all chains
- Cross-chain swaps and transfers
- No manual bridging needed

### 4. **Developer Experience**
- Simple, intuitive API
- Clear error messages
- Comprehensive documentation
- TypeScript support

## Example Frontend Flow

```typescript
// 1. Get unified balance
const balance = await api.get(`/profiles/${profileId}/balance`);

// 2. Create intent for transfer
const intent = await api.post(`/profiles/${profileId}/intent`, {
  type: 'transfer',
  from: {
    token: selectedToken.address,
    chainId: selectedToken.chainId,
    amount: parseUnits(amount, selectedToken.decimals)
  },
  to: {
    address: recipientAddress
  }
});

// 3. Sign operations with session wallet
const signatures = await wallet.signOperations(intent.data.unsignedOperations);

// 4. Submit signed operations
const result = await api.post(`/operations/${intent.data.operationSetId}/submit`, {
  signedOperations: signatures
});

// 5. Track status
const status = await api.get(`/operations/${intent.data.operationSetId}/status`);
```

## Error Handling

All endpoints return consistent error responses:
```json
{
  "success": false,
  "error": "Error message",
  "errors": [{
    "field": "amount",
    "message": "Insufficient balance"
  }]
}
```

## WebSocket Updates

Real-time updates for operation status:
```javascript
socket.on('operation_update', (data) => {
  console.log('Operation status:', data.status);
  console.log('Transactions:', data.transactions);
});
```

## Summary

The Orby integration seamlessly wraps all profile accounts into a unified cluster, enabling:
- ✅ One-click transactions without approvals
- ✅ Gas payment with any token
- ✅ Cross-chain operations without bridges
- ✅ Simple, developer-friendly APIs
- ✅ Real-time status updates

The implementation prioritizes developer experience with clear, simple endpoints that abstract all the complexity of Web3 interactions while maintaining security through the session wallet signing model.
