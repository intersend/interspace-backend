# V2 API Sequence Documentation

This directory contains comprehensive API sequence documentation for the Interspace V2 flat identity system. All sequences are based on 100% passing test scenarios and are optimized for AI understanding.

## 📚 Documentation Structure

### Core Identity Flows
1. [Authentication Flows](./1-authentication-flows.md) - All authentication strategies and scenarios
2. [Profile Management](./2-profile-management.md) - Profile lifecycle and operations
3. [Account Linking](./3-account-linking.md) - Identity graph and account connections
4. [Session Management](./4-session-management.md) - Token handling and session lifecycle
5. [Privacy Modes](./5-privacy-modes.md) - Privacy mode implementations and effects
6. [Error Handling](./6-error-handling.md) - Error scenarios and proper responses

### Blockchain Features
7. [MPC Operations](./7-mpc-operations.md) - Multi-party computation wallet operations
8. [Orby Chain Abstraction](./8-orby-chain-abstraction.md) - Multi-chain operations and gas abstraction
9. [Batch Operations](./9-batch-operations.md) - Efficient multi-operation execution
10. [EIP-7702 Delegation](./10-delegation-eip7702.md) - Gas-free operations via account delegation

### Visual Diagrams
- [Authentication Flow Diagram](./diagrams/auth-flow.mermaid)
- [Profile Lifecycle Diagram](./diagrams/profile-lifecycle.mermaid)
- [Account Linking Diagram](./diagrams/account-linking.mermaid)

## 🔑 Key Concepts

### Flat Identity Model
- **Accounts** are primary entities (email, wallet, social, guest)
- **Profiles** are linked to accounts via ProfileAccount junction
- **Sessions** are account-based with privacy modes
- **Identity Graph** connects accounts with privacy boundaries

### Privacy Modes
- **linked** - Full sharing across linked accounts
- **partial** - Selective data sharing
- **isolated** - No sharing, independent session

### Automatic Behaviors
- First-time users get "My Smartprofile" automatically
- Profiles have development wallets by default
- Last profile cannot be deleted
- Accounts are verified based on auth method

### Blockchain Features
- **MPC Wallets** - 2-of-2 threshold signatures (client + server)
- **Chain Abstraction** - Single API for all blockchain operations
- **Gas Abstraction** - Pay gas with any token on any chain
- **Batch Operations** - Execute multiple operations efficiently
- **EIP-7702 Delegation** - Enable gas-free operations for EOAs

## 🚀 Quick Start Examples

### New User Email Authentication
```
1. POST /api/v2/auth/send-email-code
2. POST /api/v2/auth/authenticate (strategy: email)
   → Creates account
   → Creates "My Smartprofile" 
   → Returns tokens
```

### Returning User with Account Linking
```
1. Authenticate with existing account
2. POST /api/v2/auth/link-accounts
   → Links new auth method
   → Shares profiles based on privacy mode
```

### MPC Wallet Creation
```
1. Generate P1 key share on client
2. POST /api/v2/profiles with clientShare
   → Server generates P2 share
   → Creates MPC wallet address
   → Returns profile with sessionWalletAddress
```

### Cross-Chain Transfer
```
1. GET /api/v1/profiles/:id/balance
   → Get unified balance across chains
2. POST /api/v1/profiles/:id/intent
   → Build cross-chain transfer operation
3. Sign with MPC wallet
4. POST /api/v1/operations/:id/submit
   → Execute on blockchain
```

### Gas-Free Operations (EIP-7702)
```
1. POST /api/v1/profiles/:id/accounts/:accountId/delegate
   → Create delegation authorization
2. Sign with EOA, confirm delegation
3. POST /api/v1/profiles/:id/execute-delegated
   → Execute operations without ETH
```

## 📊 State Management

Each API call results in specific state changes:
- Database records created/updated
- Session tokens generated
- Identity graph modifications
- Audit logs recorded

## 🔒 Security Considerations

All flows include:
- Rate limiting (V2-specific)
- Token blacklisting on logout
- Audit logging for security events
- Verification requirements per auth type

## 🤖 AI Usage Guide

When using these sequences:
1. Follow exact endpoint paths and methods
2. Include all required headers (especially Authorization)
3. Respect privacy mode boundaries
4. Handle all documented error cases
5. Maintain session state between calls

For implementation details, refer to the specific flow documentation.