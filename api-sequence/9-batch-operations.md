# Batch Operations API Sequence

## Overview
This document details the API sequences for batch operations, enabling multiple blockchain operations to be executed efficiently in a single flow.

## Key Features
- Execute up to 10 operations per batch
- Support for transfers and swaps
- Atomic or non-atomic execution modes
- Gas optimization across operations
- Comprehensive status tracking

## 1. Create Batch Intent

### Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- POST /api/v1/profiles/:id/ |                               |
  |   batch-intent ------------->|                               |
  |   {                           |                               |
  |     operations: [{            |                               |
  |       type: "transfer",       |                               |
  |       from: {                 |                               |
  |         token: "eth",         |                               |
  |         chainId: 1,           |                               |
  |         amount: "0.1"         |                               |
  |       },                      |                               |
  |       to: {                   |                               |
  |         address: "0x..."      |                               |
  |       }                       |                               |
  |     }, {                      |                               |
  |       type: "swap",           |                               |
  |       from: {                 |                               |
  |         token: "usdc",        |                               |
  |         chainId: 1,           |                               |
  |         amount: "100"         |                               |
  |       },                      |                               |
  |       to: {                   |                               |
  |         token: "dai"          |                               |
  |       }                       |                               |
  |     }],                       |                               |
  |     atomicExecution: true     |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Validate operations         |
  |                               |-- Create batch record         |
  |                               |                               |
  |                               |-- For each operation:         |
  |                               |   Build via Orby ------------>|
  |                               |<-- Unsigned operations -------|
  |                               |                               |
  |                               |-- Store in BatchOperation     |
  |                               |-- Store in OrbyOperation      |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      batchId: "batch_...",    |                               |
  |      operations: [{           |                               |
  |        operationSetId: "...", |                               |
  |        type: "transfer",      |                               |
  |        unsignedOps: [...]     |                               |
  |      }, ...]                  |                               |
  |    }                          |                               |
```

## 2. Execute Batch

### Signing and Submission Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- Sign all operations         |                               |
  |   with MPC wallet             |                               |
  |                               |                               |
  |-- POST /api/v1/batch/:id/    |                               |
  |   execute ------------------->|                               |
  |   {                           |                               |
  |     signatures: [{            |                               |
  |       operationSetId: "...",  |                               |
  |       signatures: [{          |                               |
  |         index: 0,             |                               |
  |         signature: "0x..."    |                               |
  |       }]                      |                               |
  |     }, ...]                   |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Validate signatures         |
  |                               |-- Update batch status:        |
  |                               |   "submitted"                 |
  |                               |                               |
  |                               |-- For each operation:         |
  |                               |   Submit to Orby ------------>|
  |                               |<-- Transaction hash ----------|
  |                               |                               |
  |                               |   If atomic && failed:        |
  |                               |     Stop execution            |
  |                               |                               |
  |                               |-- Update batch results        |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      batchId: "batch_...",    |                               |
  |      status: "submitted",     |                               |
  |      results: [{              |                               |
  |        operationSetId: "...", |                               |
  |        success: true,         |                               |
  |        txHash: "0x..."        |                               |
  |      }, ...]                  |                               |
  |    }                          |                               |
```

## 3. Monitor Batch Status

### Status Checking Sequence
```
Client                          Backend                         Orby API
  |                               |                               |
  |-- GET /api/v1/batch/:id/     |                               |
  |   status -------------------->|                               |
  |                               |                               |
  |                               |-- Get batch from DB           |
  |                               |-- Check operation statuses -->|
  |                               |<-- Current statuses ----------|
  |                               |                               |
  |                               |-- Aggregate status:           |
  |                               |   - All success: "completed"  |
  |                               |   - Some failed: "partial"    |
  |                               |   - In progress: "pending"    |
  |                               |                               |
  |<-- 200 OK -------------------|                               |
  |    {                          |                               |
  |      batchId: "batch_...",    |                               |
  |      status: "completed",     |                               |
  |      summary: {               |                               |
  |        total: 2,              |                               |
  |        successful: 2,         |                               |
  |        failed: 0,             |                               |
  |        pending: 0             |                               |
  |      },                       |                               |
  |      operations: [...]        |                               |
  |    }                          |                               |
```

## 4. Retry Failed Operations

### Retry Sequence
```
Client                          Backend                         
  |                               |                               
  |-- POST /api/v1/batch/:id/    |                               
  |   retry --------------------->|                               
  |   {                           |                               
  |     operationIds: ["op1", "op2"],                            
  |     updateParams: {           |                               
  |       // Optional updates     |                               
  |     }                         |                               
  |   }                           |                               
  |                               |                               
  |                               |-- Get failed operations       
  |                               |-- Create new batch            
  |                               |-- Copy operations with        
  |                               |   updates if provided         
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      newBatchId: "batch_...", |                               
  |      retryCount: 2            |                               
  |    }                          |                               
```

## 5. Complex Batch Examples

### Multi-Chain Batch
```
Client                          Backend                         
  |                               |                               
  |-- POST /api/v1/profiles/:id/ |                               
  |   batch-intent ------------->|                               
  |   {                           |                               
  |     operations: [{            |                               
  |       type: "transfer",       |                               
  |       from: {                 |                               
  |         token: "eth",         |                               
  |         chainId: 1,           |                               
  |         amount: "0.1"         |                               
  |       },                      |                               
  |       to: { address: "0x..." }|                               
  |     }, {                      |                               
  |       type: "transfer",       |                               
  |       from: {                 |                               
  |         token: "matic",       |                               
  |         chainId: 137,         |                               
  |         amount: "10"          |                               
  |       },                      |                               
  |       to: { address: "0x..." }|                               
  |     }]                        |                               
  |   }                           |                               
  |                               |                               
  |                               |-- Groups by chain             
  |                               |-- Optimizes gas per chain     
  |                               |-- Returns operations          
  |                               |   sorted by chain             
```

### DeFi Strategy Batch
```
Client                          Backend                         
  |                               |                               
  |-- POST /api/v1/profiles/:id/ |                               
  |   batch-intent ------------->|                               
  |   {                           |                               
  |     operations: [{            |                               
  |       type: "approve",        |                               
  |       token: "usdc",          |                               
  |       spender: "0xDEX...",    |                               
  |       amount: "unlimited"     |                               
  |     }, {                      |                               
  |       type: "swap",           |                               
  |       from: {                 |                               
  |         token: "usdc",        |                               
  |         amount: "1000"        |                               
  |       },                      |                               
  |       to: { token: "weth" }   |                               
  |     }, {                      |                               
  |       type: "addLiquidity",   |                               
  |       tokens: ["usdc", "weth"],                              
  |       amounts: ["500", "0.2"] |                               
  |     }],                       |                               
  |     atomicExecution: true     |                               
  |   }                           |                               
```

## 6. Error Handling

### Partial Failure Analysis
```
Client                          Backend                         
  |                               |                               
  |-- GET /api/v1/batch/:id/     |                               
  |   failure-analysis ---------->|                               
  |                               |                               
  |                               |-- Analyze failed ops:         
  |                               |   - Categorize errors         
  |                               |   - Identify dependencies     
  |                               |   - Suggest fixes             
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      failedOperations: [{     |                               
  |        operationId: "...",    |                               
  |        reason: "INSUFFICIENT_BALANCE",                       
  |        suggestion: "Add 50 USDC",                            
  |        retryable: true        |                               
  |      }],                      |                               
  |      impactedOperations: [...] |                               
  |    }                          |                               
```

## Error Cases

### Validation Errors
```json
{
  "error": "BATCH_VALIDATION_ERROR",
  "message": "Invalid batch operations",
  "details": {
    "operation": 2,
    "issue": "Invalid token address"
  }
}
```

### Execution Errors
```json
{
  "error": "BATCH_EXECUTION_FAILED",
  "message": "Batch execution failed",
  "details": {
    "successful": 1,
    "failed": 2,
    "failureReason": "Operation 2 failed: insufficient balance"
  }
}
```

### Atomic Execution Failure
```json
{
  "error": "ATOMIC_EXECUTION_FAILED",
  "message": "Atomic batch failed on operation 2",
  "details": {
    "failedOperation": "op_123",
    "reason": "Gas estimation failed",
    "rollback": true
  }
}
```

## Database Schema

### BatchOperation
```typescript
{
  id: string
  profileId: string
  batchId: string // unique
  status: "created" | "submitted" | "partial" | "completed" | "failed"
  operations: Json // Array of operation intents
  results: Json // Execution results
  atomicExecution: boolean
  metadata: Json
  createdAt: DateTime
  updatedAt: DateTime
}
```

## Performance Considerations

1. **Operation Limit**: Maximum 10 operations per batch
2. **Gas Optimization**: Operations grouped by chain
3. **Parallel Execution**: Non-atomic batches execute in parallel
4. **Status Caching**: 30-second cache for status checks
5. **Retry Limits**: Maximum 3 retry attempts

## Security

1. **Authentication**: Valid JWT required
2. **Profile Ownership**: Verified for all operations
3. **Signature Validation**: Each operation individually signed
4. **Rate Limiting**: 5 batch creations per minute
5. **Audit Trail**: All batch operations logged