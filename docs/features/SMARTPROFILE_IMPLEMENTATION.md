# SmartProfile Technical Specification

## Overview
SmartProfiles act as user-defined profiles that group multiple wallets and apps under one context (Trading, Gaming, etc.). Each profile is paired with its own MPC session wallet to execute transactions on the user's behalf. The architecture overview in the README lists SmartProfiles and session wallets among the core components of the backend:

```
1. **SmartProfiles**: User-owned profiles that group crypto accounts
2. **Session Wallets**: ERC-7702 proxy wallets for seamless transactions
```

These profiles support multi-device authentication and iPhone-style app management.

## Data Model
The Prisma schema defines the SmartProfile model and its relations:

```prisma
model SmartProfile {
  id                    String   @id @default(cuid())
  userId                String
  name                  String
  sessionWalletAddress  String   @unique // ERC-7702 proxy address
  isActive              Boolean  @default(false)
  orbyAccountClusterId  String?  @unique
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relationships
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  linkedAccounts LinkedAccount[]
  folders        Folder[]
  apps           BookmarkedApp[]
  transactions   Transaction[]
  auditLogs      AuditLog[]
  preferredGasToken PreferredGasToken?
  orbyVirtualNodes  OrbyVirtualNode[]
  orbyOperations    OrbyOperation[]

  @@map("smart_profiles")
}
```

Each SmartProfile belongs to a user and can contain many linked accounts, bookmarked apps, folders and transactions. Profiles are isolated enclaves with encrypted data and full audit logging.

## Creation Flow
When a SmartProfile is created, the service performs the following steps:

```ts
// SmartProfileService.createProfile()
const { address: sessionWalletAddress } = await sessionWalletService.createSessionWallet(profile.id, clientShare);
// Save the address then create Orby account cluster
const clusterId = await orbyService.createOrGetAccountCluster(updatedProfile, tx);
```

During profile creation:
1. A session wallet (ERC‑7702 proxy) is generated.
2. An Orby account cluster is automatically created.
3. The cluster initially contains only the session wallet.

This prepares the profile for cross-chain transactions and gas abstraction.

## Session Wallet
Session wallets are generated using Silence Labs two-party MPC. They are automatically created for every profile and support gas sponsoring, multi-chain execution and batch transactions.

```
### Session Wallet Endpoints
Session wallets are automatically created for each SmartProfile using ERC-7702 proxy contracts.
- Gas Sponsoring
- Multi-chain
- Proxy Pattern
- Batch Transactions
```

The client retains its MPC share locally while the server keeps only its share, as documented in the storage overview:

```
- MPC key shares: The server stores only its share of the MPC wallet. The client share lives on the device.
```

## API Endpoints
The backend exposes REST endpoints for managing SmartProfiles:

```
GET  /profiles               -> List all profiles
POST /profiles               -> Create new profile
GET  /profiles/:id           -> Get profile details
PUT  /profiles/:id           -> Update name or activation state
DELETE /profiles/:id         -> Delete profile
POST /profiles/:id/activate  -> Set profile as active
```

A typical `SmartProfileResponse` object returned by these endpoints contains:

```ts
{
  id: string;
  name: string;
  sessionWalletAddress: string;
  isActive: boolean;
  linkedAccountsCount: number;
  appsCount: number;
  foldersCount: number;
  createdAt: string;
  updatedAt: string;
}
```

## Security and Storage
SmartProfiles follow local‑first principles. Sensitive OAuth tokens and other secret data are encrypted with AES‑256‑GCM. Key material never leaves its environment: the device keeps the client share of the MPC key and the server only keeps its share.
Audit logs track all profile operations for traceability.

## Transaction Flow
Transactions originate from the React Native app, are signed with the session wallet, and then executed through an ERC‑7702 proxy. The README illustrates the full path from mobile app to target dApp contract.

```
React Native App
    ↓ (User initiates transaction)
Silence Labs SDK in RN
    ↓ (Auth token to backend)
Interspace Backend API
    ↓ (Session wallet delegation)
ERC-7702 Proxy Contract
    ↓ (Execute on behalf of user)
Target dApp Contract
```

SmartProfiles tie together these components, providing users with secure, multi-chain profiles that can manage accounts and bookmarked apps while delegating transactions through their MPC session wallets.
