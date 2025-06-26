# EIP-7702 Delegation API Sequence

## Overview
This document details the API sequences for EIP-7702 delegation, enabling gas-free operations through account authorization.

## Architecture
- **Delegated EOAs**: Regular wallets that authorize the session wallet
- **Session Wallet**: MPC wallet that pays gas on behalf of EOAs
- **Authorization**: EIP-7702 authorization data signed by EOAs
- **Gas Abstraction**: EOAs can transact without holding ETH

## 1. Create Delegation Authorization

### Sequence
```
Client                          Backend                         
  |                               |                               
  |-- POST /api/v1/profiles/:id/ |                               
  |   accounts/:accountId/       |                               
  |   delegate ------------------>|                               
  |   {                           |                               
  |     permissions: {            |                               
  |       transfer: true,         |                               
  |       swap: true,             |                               
  |       approve: false          |                               
  |     },                        |                               
  |     expiresAt: "2024-12-31"   |                               
  |   }                           |                               
  |                               |                               
  |                               |-- Verify account ownership    
  |                               |-- Check no active delegation  
  |                               |-- Generate nonce (timestamp)  
  |                               |                               
  |                               |-- Create authorization:       
  |                               |   0x05 || rlp([              
  |                               |     chainId,                  
  |                               |     sessionWallet,            
  |                               |     nonce                     
  |                               |   ])                          
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      authorizationData: {     |                               
  |        chainId: 1,            |                               
  |        address: "0xSession...",|                               
  |        nonce: "1234567890"    |                               
  |      },                       |                               
  |      messageToSign: "0x05..." |                               
  |    }                          |                               
```

### Sign and Confirm Delegation
```
Client                          Backend                         
  |                               |                               
  |-- Sign with EOA private key   |                               
  |                               |                               
  |-- POST /api/v1/profiles/:id/ |                               
  |   accounts/:accountId/       |                               
  |   delegate/confirm ---------->|                               
  |   {                           |                               
  |     signature: "0x...",       |                               
  |     authorizationData: {...}  |                               
  |   }                           |                               
  |                               |                               
  |                               |-- Verify signature            
  |                               |-- Store delegation:           
  |                               |   - linkedAccountId           
  |                               |   - sessionWallet             
  |                               |   - permissions               
  |                               |   - authorizationData         
  |                               |   - isActive: true            
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      delegationId: "del_...", |                               
  |      status: "active"         |                               
  |    }                          |                               
```

## 2. Check Execution Path

### Sequence
```
Client                          Backend                         
  |                               |                               
  |-- GET /api/v1/profiles/:id/  |                               
  |   execution-path ------------>|                               
  |                               |                               
  |                               |-- Check active delegations    
  |                               |-- Analyze gas availability    
  |                               |                               
  |                               |-- If delegations exist:       
  |                               |   Return "delegated" path     
  |                               |-- Else:                       
  |                               |   Return "direct" path        
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      recommendedPath:         |                               
  |        "delegated",           |                               
  |      delegations: [{          |                               
  |        accountAddress: "0x...",                              
  |        permissions: {...}     |                               
  |      }],                      |                               
  |      gaslessEnabled: true     |                               
  |    }                          |                               
```

## 3. Execute Delegated Transaction

### Gas-Free Transfer
```
Client                          Backend                         Blockchain
  |                               |                               |
  |-- POST /api/v1/profiles/:id/ |                               |
  |   execute-delegated --------->|                               |
  |   {                           |                               |
  |     delegationId: "del_...",  |                               |
  |     transaction: {            |                               |
  |       to: "0xRecipient...",   |                               |
  |       value: "1000000",       |                               |
  |       data: "0x"              |                               |
  |     }                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Load delegation             
  |                               |-- Verify permissions:         
  |                               |   - Is active?                
  |                               |   - Not expired?              
  |                               |   - Has transfer permission?  
  |                               |                               
  |                               |-- Execute via session wallet: 
  |                               |   - From: delegated EOA       
  |                               |   - Gas paid by: session      
  |                               |   - Authority: delegation     
  |                               |                               
  |                               |-- Sign with MPC wallet ------>|
  |                               |<-- Transaction hash -----------|
  |                               |                               
  |                               |-- Track as delegated tx       
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      txHash: "0x...",         |                               
  |      executedBy: "0xSession...",                             
  |      onBehalfOf: "0xEOA...",  |                               
  |      gasPaidBy: "session"     |                               
  |    }                          |                               
```

### Gas-Free Swap
```
Client                          Backend                         Orby
  |                               |                               |
  |-- POST /api/v1/profiles/:id/ |                               |
  |   execute-delegated --------->|                               |
  |   {                           |                               |
  |     delegationId: "del_...",  |                               |
  |     operation: {              |                               |
  |       type: "swap",           |                               |
  |       from: {                 |                               |
  |         token: "usdc",        |                               |
  |         amount: "100"         |                               |
  |       },                      |                               |
  |       to: { token: "dai" }    |                               |
  |     }                         |                               |
  |   }                           |                               |
  |                               |                               |
  |                               |-- Verify swap permission      
  |                               |-- Build swap via Orby ------->|
  |                               |<-- Swap operations -----------|
  |                               |                               
  |                               |-- Execute with delegation:    
  |                               |   Authority from EOA          
  |                               |   Gas from session wallet     
  |                               |                               
  |<-- 200 OK -------------------|                               
```

## 4. List Active Delegations

### Sequence
```
Client                          Backend                         
  |                               |                               
  |-- GET /api/v1/profiles/:id/  |                               
  |   delegations --------------->|                               
  |                               |                               
  |                               |-- Query active delegations    
  |                               |-- Include linked accounts     
  |                               |-- Check expiration status     
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      delegations: [{          |                               
  |        id: "del_123",         |                               
  |        account: {             |                               
  |          address: "0x...",    |                               
  |          name: "Trading EOA"  |                               
  |        },                      |                               
  |        permissions: {         |                               
  |          transfer: true,      |                               
  |          swap: true,          |                               
  |          approve: false       |                               
  |        },                      |                               
  |        createdAt: "...",      |                               
  |        expiresAt: "...",      |                               
  |        isActive: true         |                               
  |      }]                       |                               
  |    }                          |                               
```

## 5. Revoke Delegation

### Sequence
```
Client                          Backend                         
  |                               |                               
  |-- DELETE /api/v1/profiles/   |                               
  |   :id/delegations/:delId --->|                               
  |                               |                               
  |                               |-- Verify ownership            
  |                               |-- Update delegation:          
  |                               |   - isActive: false           
  |                               |   - revokedAt: now()          
  |                               |                               
  |                               |-- Future: Submit revocation   
  |                               |   to blockchain               
  |                               |                               
  |<-- 200 OK -------------------|                               
  |    {                          |                               
  |      message: "Delegation revoked",                          
  |      revokedAt: "2024-06-25"  |                               
  |    }                          |                               
```

## 6. Batch Operations with Delegation

### Delegated Batch Execution
```
Client                          Backend                         
  |                               |                               
  |-- POST /api/v1/profiles/:id/ |                               
  |   batch-intent ------------->|                               
  |   {                           |                               
  |     delegationId: "del_...",  |                               
  |     operations: [{            |                               
  |       type: "transfer",       |                               
  |       from: {                 |                               
  |         address: "0xEOA...",  |                               
  |         token: "usdc",        |                               
  |         amount: "50"          |                               
  |       },                      |                               
  |       to: { address: "0x..." }|                               
  |     }, {                      |                               
  |       type: "transfer",       |                               
  |       from: {                 |                               
  |         address: "0xEOA...",  |                               
  |         token: "dai",         |                               
  |         amount: "100"         |                               
  |       },                      |                               
  |       to: { address: "0x..." }|                               
  |     }]                        |                               
  |   }                           |                               
  |                               |                               
  |                               |-- All operations execute:     
  |                               |   - With EOA authority        
  |                               |   - Gas paid by session       
  |                               |   - Single signing flow       
  |                               |                               
  |<-- 200 OK -------------------|                               
```

## Error Cases

### Invalid Permissions
```json
{
  "error": "PERMISSION_DENIED",
  "message": "Delegation does not permit swap operations",
  "details": {
    "delegationId": "del_123",
    "requestedOperation": "swap",
    "permissions": {
      "transfer": true,
      "swap": false
    }
  }
}
```

### Expired Delegation
```json
{
  "error": "DELEGATION_EXPIRED",
  "message": "Delegation expired on 2024-06-01",
  "details": {
    "delegationId": "del_123",
    "expiredAt": "2024-06-01T00:00:00Z"
  }
}
```

### Revoked Delegation
```json
{
  "error": "DELEGATION_REVOKED",
  "message": "This delegation has been revoked",
  "details": {
    "delegationId": "del_123",
    "revokedAt": "2024-05-15T10:30:00Z"
  }
}
```

## Security Considerations

1. **Signature Verification**: All delegations require valid EOA signatures
2. **Permission Boundaries**: Operations validated against granted permissions
3. **Expiration Enforcement**: Expired delegations automatically rejected
4. **Ownership Validation**: Only account owners can create/revoke delegations
5. **Audit Trail**: All delegated operations logged with full context

## Database Schema

### AccountDelegation
```typescript
{
  id: string
  linkedAccountId: string // Reference to linked EOA
  sessionWallet: string   // MPC session wallet address
  chainId: number         // Network chain ID
  authorizationData: Json // Signed EIP-7702 data
  permissions: Json       // Granted permissions
  nonce: bigint          // Authorization nonce
  expiresAt?: DateTime   // Optional expiration
  isActive: boolean      // Active status
  revokedAt?: DateTime   // Revocation timestamp
  createdAt: DateTime
  updatedAt: DateTime
}
```

## Current Implementation Status

✅ **Implemented**:
- Authorization creation and signing
- Permission management system
- Delegation storage and retrieval
- Signature verification
- API endpoints for all operations
- Integration with session wallet

⚠️ **Simulated** (Ready for EIP-7702):
- On-chain delegation activation
- Actual EIP-7702 transaction format
- Gas estimation for delegated transactions

## Future Enhancements

1. **On-chain Activation**: Deploy delegation to blockchain when EIP-7702 is live
2. **Multi-sig Delegations**: Require multiple signatures for high-value operations
3. **Conditional Delegations**: Time-based or value-based restrictions
4. **Delegation Templates**: Pre-configured permission sets
5. **Analytics**: Track gas savings and usage patterns