# Orby Chain Abstraction API Sequence

## Overview
This document details the API sequences for Orby chain abstraction integration, including account cluster management, unified balances, and cross-chain operations.

## Architecture
- **Account Clusters**: Groups of related addresses managed as one
- **Virtual Nodes**: Chain-specific RPC endpoints per profile
- **Unified Operations**: Single API for multi-chain actions
- **Gas Abstraction**: Pay with any token on any chain

## 1. Account Cluster Creation

### Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- POST /api/v2/profiles ----->|                               |
  |   (creates profile)           |                               |
  |                               |                               |
  |                               |-- Auto-create cluster ------->|
  |                               |   {                           |
  |                               |     accounts: [{              |
  |                               |       address: "0x...",       |
  |                               |       accountType: "EOA"      |
  |                               |     }]                        |
  |                               |   }                           |
  |                               |<-- clusterId: "cls_..." ------|
  |                               |                               |
  |                               |-- Update profile              |
  |                               |   orbyAccountClusterId        |
  |                               |                               |
  |<-- 201 Created --------------|                               |
```

### Cluster Updates (on account linking)
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- POST /api/v2/auth/         |                               |
  |   link-accounts ------------>|                               |
  |                               |                               |
  |                               |-- Update cluster ------------>|
  |                               |   {                           |
  |                               |     clusterId: "cls_...",     |
  |                               |     accounts: [               |
  |                               |       existing + new EOA      |
  |                               |     ]                         |
  |                               |   }                           |
  |                               |<-- Success -------------------|
```

## 2. Virtual Node Management

### Get RPC URL Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- GET /api/v1/profiles/:id/  |                               |
  |   orby-rpc-url?chainId=1 --->|                               |
  |                               |                               |
  |                               |-- Check cache                 |
  |                               |   (OrbyVirtualNode table)     |
  |                               |                               |
  |                               |-- If not cached:             |
  |                               |   Request virtual node ------>|
  |                               |<-- RPC URL -------------------|
  |                               |                               |
  |                               |-- Store in DB & cache        |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      rpcUrl: "https://..."    |                               |
  |    }                          |                               |
```

## 3. Unified Balance Fetching

### Sequence
```
Client                          Backend                         Orby Virtual Node
  |                               |                               |
  |-- GET /api/v1/profiles/:id/  |                               |
  |   balance ------------------->|                               |
  |                               |                               |
  |                               |-- Check Redis cache           |
  |                               |   (5-min TTL)                 |
  |                               |                               |
  |                               |-- Get/Create virtual node     |
  |                               |                               |
  |                               |-- Fetch portfolio ----------->|
  |                               |   via RPC method:             |
  |                               |   "orby_getFungibleTokenPortfolio"
  |                               |<-- Token balances ------------|
  |                               |                               |
  |                               |-- Transform & aggregate       |
  |                               |-- Cache in Redis              |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      totalUsdValue: "1234.56",|                               |
  |      tokens: [{               |                               |
  |        standardizedTokenId:   |                               |
  |          "eth",               |                               |
  |        symbol: "ETH",         |                               |
  |        totalAmount: "1.5",    |                               |
  |        balancesPerChain: [...] |                               |
  |      }]                       |                               |
  |    }                          |                               |
```

## 4. Transfer Operations

### Build Transfer Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- POST /api/v1/profiles/:id/ |                               |
  |   intent -------------------->|                               |
  |   {                           |                               |
  |     type: "transfer",         |                               |
  |     from: {                   |                               |
  |       token: "usdc",          |                               |
  |       chainId: 137,           |                               |
  |       amount: "100"           |                               |
  |     },                        |                               |
  |     to: {                     |                               |
  |       address: "0x..."        |                               |
  |     }                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Get virtual node RPC        |
  |                               |-- Build transfer data         |
  |                               |                               |
  |                               |-- Get operations to execute ->|
  |                               |   {                           |
  |                               |     accountClusterId,         |
  |                               |     encodedTx,                |
  |                               |     tokenAddress               |
  |                               |   }                           |
  |                               |<-- Unsigned operations -------|
  |                               |                               |
  |                               |-- Store in OrbyOperation      |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      operationSetId: "...",   |                               |
  |      operations: [...]         |                               |
  |    }                          |                               |
```

### Submit Signed Operations
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- Sign operations with MPC    |                               |
  |                               |                               |
  |-- POST /api/v1/operations/   |                               |
  |   :id/submit ---------------->|                               |
  |   {                           |                               |
  |     signatures: [{            |                               |
  |       index: 0,               |                               |
  |       signature: "0x..."      |                               |
  |     }]                        |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Submit to Orby ------------>|
  |                               |<-- Transaction hashes --------|
  |                               |                               |
  |                               |-- Create transaction records  |
  |                               |-- Start monitoring            |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      success: true,           |                               |
  |      transactions: [...]      |                               |
  |    }                          |                               |
```

## 5. Cross-Chain Operations

### Cross-Chain Transfer Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- POST /api/v1/profiles/:id/ |                               |
  |   intent -------------------->|                               |
  |   {                           |                               |
  |     type: "transfer",         |                               |
  |     from: {                   |                               |
  |       token: "usdc",          |                               |
  |       chainId: 1,             |                               |
  |       amount: "100"           |                               |
  |     },                        |                               |
  |     to: {                     |                               |
  |       address: "0x...",       |                               |
  |       chainId: 137 // Different chain                       |
  |     }                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Build cross-chain op ------>|
  |                               |<-- Bridge operations ---------|
  |                               |   {                           |
  |                               |     operations: [...],        |
  |                               |     bridgeInfo: {             |
  |                               |       bridge: "across",       |
  |                               |       estimatedTime: 600      |
  |                               |     }                         |
  |                               |   }                           |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
```

## 6. Swap Operations

### Build Swap Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- POST /api/v1/profiles/:id/ |                               |
  |   intent -------------------->|                               |
  |   {                           |                               |
  |     type: "swap",             |                               |
  |     from: {                   |                               |
  |       token: "usdc",          |                               |
  |       chainId: 1,             |                               |
  |       amount: "100"           |                               |
  |     },                        |                               |
  |     to: {                     |                               |
  |       token: "eth",           |                               |
  |       chainId: 1              |                               |
  |     }                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Get standardized token IDs  |
  |                               |-- Build swap request -------->|
  |                               |<-- Swap route & quote --------|
  |                               |   {                           |
  |                               |     quote: {                  |
  |                               |       fromAmount: "100",      |
  |                               |       toAmount: "0.025",      |
  |                               |       rate: "0.00025"         |
  |                               |     }                         |
  |                               |   }                           |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
```

## 7. Gas Abstraction

### Gas Token Analysis
```
Client                          Backend                         
  |                               |                               
  |-- GET /api/v1/profiles/:id/  |                               
  |   gas-tokens --------------->|                               
  |                               |                               
  |                               |-- Get unified balance         
  |                               |-- Analyze gas options:        
  |                               |   - Balance percentage        
  |                               |   - Native token bonus        
  |                               |   - User preferences          
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      nativeGasAvailable: [...],                              
  |      availableTokens: [{      |                               
  |        token: "usdc",         |                               
  |        score: 85,             |                               
  |        estimatedTxs: 50       |                               
  |      }],                      |                               
  |      suggestedToken: {...}    |                               
  |    }                          |                               
```

### Operation with Gas Token
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- POST /api/v1/profiles/:id/ |                               |
  |   intent -------------------->|                               |
  |   {                           |                               |
  |     type: "transfer",         |                               |
  |     ...,                      |                               |
  |     gasToken: {               |                               |
  |       standardizedTokenId:    |                               |
  |         "usdc",               |                               |
  |       tokenSources: [...]     |                               |
  |     }                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Include gas token in request|
  |                               |-- Orby handles gas payment -->|
  |                               |<-- Operations with gas info --|
```

## 8. Operation Monitoring

### Status Subscription
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- GET /api/v1/operations/    |                               |
  |   :id/status ---------------->|                               |
  |                               |                               |
  |                               |-- Subscribe to updates ------>|
  |                               |<-- Status: pending ------------|
  |                               |                               |
  |                               |   ... (monitoring) ...        |
  |                               |                               |
  |                               |<-- Status: successful ---------|
  |                               |-- Update DB records           |
  |                               |-- Invalidate caches           |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      status: "successful",    |                               |
  |      completedAt: "...",      |                               |
  |      transactions: [...]      |                               |
  |    }                          |                               |
```

## Error Cases

### Insufficient Balance
```json
{
  "error": "INSUFFICIENT_BALANCE",
  "message": "Not enough USDC on Polygon",
  "details": {
    "required": "100",
    "available": "50",
    "token": "usdc",
    "chainId": 137
  }
}
```

### Invalid Route
```json
{
  "error": "NO_ROUTE_FOUND",
  "message": "Cannot find route for swap",
  "details": {
    "from": "obscure-token",
    "to": "eth",
    "chainId": 1
  }
}
```

### Gas Estimation Failure
```json
{
  "error": "GAS_ESTIMATION_FAILED",
  "message": "Cannot estimate gas for operation",
  "details": {
    "reason": "Contract execution would fail"
  }
}
```

## Caching Strategy

1. **Balance Cache**: 5 minutes, invalidated on transaction
2. **Token ID Cache**: 1 hour for standardized IDs
3. **Virtual Node Cache**: Persistent until cluster update
4. **Gas Analysis Cache**: 5 minutes
5. **Request Coalescing**: Prevents duplicate API calls

## Security Considerations

1. **Authentication**: All endpoints require valid JWT
2. **Profile Ownership**: Verified on every request
3. **Rate Limiting**: 
   - Balance: 60/minute
   - Operations: 20/minute
   - Transactions: 10/minute
4. **Audit Logging**: All operations logged