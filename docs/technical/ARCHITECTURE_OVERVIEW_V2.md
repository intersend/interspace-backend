# Interspace Backend Architecture V2

This document provides a comprehensive overview of the Interspace backend with the new flat identity architecture.

## Architecture Evolution

### V1 (Hierarchical)
```
User → SmartProfiles → LinkedAccounts
```

### V2 (Flat Identity) 🆕
```
Accounts ↔ Identity Graph ↔ SmartProfiles
```

## Core Architecture Components

### 1. Flat Identity Model

The backend now treats every authentication method as a first-class **Account** entity:

- **Wallet Accounts**: MetaMask, Coinbase, WalletConnect addresses
- **Email Accounts**: Verified email addresses
- **Social Accounts**: Google, Apple, Discord identities
- **Passkey Accounts**: WebAuthn credentials
- **Guest Accounts**: Temporary anonymous sessions

```typescript
interface Account {
  id: string;
  type: AccountType;
  identifier: string;  // unique per type
  verified: boolean;
  metadata?: object;
}
```

### 2. Identity Graph

Accounts are connected through an **Identity Graph** that respects privacy boundaries:

```typescript
interface IdentityLink {
  accountAId: string;
  accountBId: string;
  linkType: 'direct' | 'inferred';
  privacyMode: 'linked' | 'partial' | 'isolated';
}
```

### 3. SmartProfiles (Enhanced)

SmartProfiles remain activity contexts but with key improvements:

- **Automatic Creation**: First profile created automatically for new users
- **Many-to-Many**: Multiple accounts can access multiple profiles
- **Session Wallets**: Each profile still has its ERC-7702 proxy wallet
- **Privacy-Aware**: Access controlled by identity graph

### 4. Session Management

Sessions are now account-based with privacy modes:

```typescript
interface AccountSession {
  accountId: string;
  sessionToken: string;
  privacyMode: PrivacyMode;
  activeProfileId?: string;
  expiresAt: Date;
}
```

## Technology Stack

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with account-based sessions
- **MPC Wallets**: Silence Labs SDK via Duo Node proxy
- **Chain Abstraction**: Orby API for multi-chain operations
- **Real-time**: Socket.IO for live updates
- **Security**: Helmet, CORS, rate limiting
- **Blockchain**: Ethers v6, EIP-7702 delegation support

## API Structure

### V2 Endpoints (New) 🆕

Base: `/api/v2`

- `/auth/authenticate` – Unified authentication for all account types
- `/auth/link-accounts` – Link accounts together
- `/auth/identity-graph` – View account relationships
- `/auth/switch-profile` – Change active profile
- `/profiles` – Access-controlled profile management
- `/accounts` – Account management

### V1 Endpoints (Active)

Base: `/api/v1`

**Identity & Auth** (Legacy):
- Still supported for backward compatibility
- Mapped internally to V2 services

**Blockchain Features** (Active):
- `/profiles/:id/balance` – Unified multi-chain balance
- `/profiles/:id/intent` – Build transfer/swap operations
- `/profiles/:id/batch-intent` – Batch operations
- `/operations/:id/submit` – Submit signed operations
- `/operations/:id/status` – Operation status
- `/profiles/:id/gas-tokens` – Gas payment options
- `/profiles/:id/orby-rpc-url` – Virtual node RPC
- `/profiles/:id/accounts/:accountId/delegate` – EIP-7702 delegation
- `/profiles/:id/execute-delegated` – Gas-free execution
- `/batch/:id/execute` – Execute batch operations
- `/mpc/backup` – Backup MPC key shares
- `/mpc/rotate-key` – Rotate MPC keys

## Data Flow Examples

### New User Registration

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant AccountService
    participant ProfileService
    participant MPC
    
    Client->>API: POST /v2/auth/authenticate
    API->>AccountService: findOrCreateAccount()
    AccountService->>API: Account created
    API->>MPC: createSessionWallet()
    MPC->>API: Wallet address
    API->>ProfileService: createAutomaticProfile()
    ProfileService->>API: "My Smartprofile" created
    API->>Client: tokens + profile
```

### Account Linking

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant AccountService
    participant IdentityGraph
    
    Client->>API: POST /v2/auth/link-accounts
    API->>AccountService: verifyAccountOwnership()
    AccountService->>IdentityGraph: createLink()
    IdentityGraph->>API: Accounts linked
    API->>Client: Updated profile access
```

### Cross-Chain Transfer

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant OrbyService
    participant MPC
    participant Blockchain
    
    Client->>API: POST /profiles/:id/intent
    API->>OrbyService: buildTransferOperation()
    OrbyService->>API: Unsigned operations
    API->>Client: Operations to sign
    Client->>MPC: Sign with P1 share
    MPC->>Client: Signatures
    Client->>API: POST /operations/:id/submit
    API->>Blockchain: Execute transaction
    Blockchain->>API: Transaction hash
    API->>Client: Success
```

### Gas-Free Delegation

```mermaid
sequenceDiagram
    participant EOA
    participant API
    participant DelegationService
    participant SessionWallet
    
    EOA->>API: POST /accounts/:id/delegate
    API->>DelegationService: createAuthorization()
    DelegationService->>EOA: Authorization to sign
    EOA->>API: POST /delegate/confirm
    API->>DelegationService: Store delegation
    EOA->>API: POST /execute-delegated
    API->>SessionWallet: Pay gas & execute
    SessionWallet->>API: Transaction complete
    API->>EOA: Success (no gas spent)
```

## Database Schema (Key Tables)

### New Tables

```sql
-- Primary account entities
accounts (
  id, type, identifier, verified, metadata
)

-- Account relationships
identity_links (
  account_a_id, account_b_id, link_type, privacy_mode
)

-- Profile access control
profile_accounts (
  profile_id, account_id, permissions
)

-- Account-based sessions
account_sessions (
  account_id, session_token, privacy_mode, active_profile_id
)
```

### Modified Tables

```sql
-- SmartProfiles now linked to accounts
smart_profiles (
  ...,
  created_by_account_id,  -- NEW
  orby_account_cluster_id -- Orby integration
)
```

### Blockchain Tables

```sql
-- MPC key management
mpc_key_shares (
  profile_id, key_id, public_key, key_share, address
)

-- Orby integration
orby_virtual_nodes (
  profile_id, chain_id, rpc_url
)

orby_operations (
  profile_id, operation_set_id, type, status, unsigned_payload
)

orby_transactions (
  operation_id, hash, chain_id, status
)

-- Batch operations
batch_operations (
  profile_id, batch_id, status, operations, results
)

-- EIP-7702 delegations
account_delegations (
  linked_account_id, session_wallet, permissions, authorization_data
)

-- Gas preferences
preferred_gas_tokens (
  profile_id, chain_id, token_id
)
```

## Service Architecture

### Core Services

1. **AccountService** (New)
   - Account creation and verification
   - Identity graph management
   - Privacy mode enforcement

2. **AuthControllerV2** (New)
   - Unified authentication
   - Account linking
   - Session management

3. **SmartProfileService** (Enhanced)
   - Automatic profile creation
   - Access control via identity graph
   - Backward compatibility

4. **SessionWalletService**
   - MPC wallet creation with 2-of-2 threshold
   - Transaction signing via distributed protocol
   - Key rotation and backup support
   - Integration with Duo Node proxy

5. **OrbyService**
   - Account cluster management
   - Virtual node RPC endpoints
   - Unified balance across chains
   - Gas abstraction with any token
   - Cross-chain operation building

6. **BatchOperationService** (New)
   - Multi-operation batching
   - Atomic/non-atomic execution
   - Gas optimization
   - Status tracking and retry

7. **AccountDelegationService** (New)
   - EIP-7702 delegation management
   - Gas-free operation execution
   - Permission enforcement
   - Delegation lifecycle

## Blockchain Architecture

### MPC Wallet System
```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Client    │────▶│   Backend   │────▶│  Duo Node    │
│  (P1 Share) │     │ (P2 Share)  │     │   (Proxy)    │
└─────────────┘     └─────────────┘     └──────────────┘
                                                 │
                                                 ▼
                                        ┌──────────────┐
                                        │ Silence Labs │
                                        │    Cloud     │
                                        └──────────────┘
```

### Chain Abstraction Layer
```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Profile   │────▶│    Orby     │────▶│  Multiple    │
│  (Cluster)  │     │   Service   │     │   Chains     │
└─────────────┘     └─────────────┘     └──────────────┘
        │                   │
        ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Unified   │     │   Virtual   │
│   Balance   │     │    Nodes    │
└─────────────┘     └─────────────┘
```

### EIP-7702 Delegation Flow
```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│     EOA     │────▶│   Session   │────▶│ Transaction  │
│ (Authorizes)│     │   Wallet    │     │  (Gas-free)  │
└─────────────┘     │ (Pays Gas)  │     └──────────────┘
                    └─────────────┘
```

## Security Enhancements

### 1. No Single Point of Failure
- No central "User" entity
- Distributed identity across accounts
- Resilient to account compromise
- MPC prevents single key compromise

### 2. Privacy Controls
- Granular linking permissions
- Isolated account support
- Audit trail for all operations
- Encrypted key share storage

### 3. Session Security
- Account-specific sessions
- Privacy mode enforcement
- Device tracking
- MPC session management

### 4. Blockchain Security
- 2-of-2 threshold signatures
- No single private key exposure
- Delegation permission boundaries
- Transaction validation

## Migration Strategy

### Phase 1: Parallel Operation
- V2 endpoints alongside V1
- Automatic account creation for existing users
- No breaking changes

### Phase 2: Gradual Migration
- New users on V2 by default
- Existing users migrated on login
- Performance monitoring

### Phase 3: V1 Deprecation
- Remove V1 endpoints
- Clean up legacy code
- Full V2 operation

## Development Workflow

### Setup
```bash
# Install dependencies
npm install

# Run migrations (includes flat identity)
npm run prisma:migrate

# Start development server
npm run dev
```

### Testing
```bash
# Run all tests
npm test

# Run V2 tests specifically
npm test -- --grep "V2"

# Test migration
npm run test:migration
```

### Environment Variables
```env
# New V2 settings
ENABLE_V2_API=true
DEFAULT_PRIVACY_MODE=linked
AUTO_CREATE_PROFILE=true
```

## Performance Considerations

### Optimizations
- Indexed account lookups
- Cached identity graphs
- Efficient permission checks

### Monitoring
- Account creation rate
- Link traversal time
- Session validation performance

## Best Practices

### 1. Account Management
```typescript
// Always normalize identifiers
const account = await accountService.findOrCreateAccount({
  type: 'email',
  identifier: email.toLowerCase()
});
```

### 2. Privacy Checks
```typescript
// Respect privacy boundaries
if (link.privacyMode === 'isolated') {
  throw new ForbiddenError('Account is isolated');
}
```

### 3. Backward Compatibility
```typescript
// Support both user and account auth
const identity = req.user || req.account;
```

## Future Enhancements

1. **Decentralized Identity**
   - DID integration
   - Verifiable credentials
   - Cross-platform identity

2. **Advanced Privacy**
   - Zero-knowledge proofs
   - Selective disclosure
   - Anonymous credentials

3. **Identity Recovery**
   - Social recovery
   - Multi-party computation
   - Time-locked recovery

## Conclusion

The V2 architecture provides a more flexible, secure, and user-friendly identity system while maintaining full backward compatibility. The flat identity model aligns with Web3 principles while delivering the seamless experience users expect.