# Account Linking

## Table of Contents
1. [Overview](#overview)
2. [Link New Account](#link-new-account)
3. [Identity Graph Queries](#identity-graph-queries)
4. [Update Link Privacy Mode](#update-link-privacy-mode)
5. [Profile Sharing Across Linked Accounts](#profile-sharing-across-linked-accounts)
6. [Unlinking Accounts](#unlinking-accounts)

---

## Overview

Account linking creates connections in the identity graph, allowing users to:
- Sign in with multiple methods (email, wallet, social)
- Share profiles across linked accounts
- Maintain a unified identity across platforms

### Key Concepts
- **Identity Link**: Connection between two accounts
- **Link Type**: `direct` (user-initiated) or `inferred` (system-detected)
- **Privacy Mode**: Controls data sharing (`linked`, `partial`, `isolated`)
- **Identity Graph**: Network of all connected accounts

---

## Link New Account

### Request
```
POST /api/v2/auth/link-accounts
Headers:
  Authorization: Bearer <accessToken>
Body:
{
  "targetType": "wallet",              // "email", "wallet", "social"
  "targetIdentifier": "0x123...",      // email, wallet address, etc.
  "targetProvider": "metamask",        // optional, for social/wallet
  "linkType": "direct",                // optional, default "direct"
  "privacyMode": "linked"              // optional, default "linked"
}
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/auth/          |                                |
  |   link-accounts ------------->|                                |
  |   {targetType: "wallet",      |-- Extract current account ---->|
  |    targetIdentifier: "0x123"} |   from JWT                     |
  |                               |-- Verify current account ----->|
  |                               |   - Must be verified           |
  |                               |   - Not guest (if not guest)   |
  |                               |-- Find/create target account ->|
  |                               |   {type: targetType,           |
  |                               |    identifier: targetIdentifier|
  |                               |-- Check existing links ------->|
  |                               |   - Not already linked         |
  |                               |   - Target not linked elsewhere|
  |                               |-- Create IdentityLink -------->|
  |                               |   {accountAId, accountBId,     |
  |                               |    linkType: "direct",         |
  |                               |    privacyMode: "linked"}      |
  |                               |-- Audit log link action ------>|
  |                               |-- Get updated profiles ------->|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    link: {                    |                                |
  |      accountAId, accountBId,  |                                |
  |      linkType, privacyMode    |                                |
  |    },                         |                                |
  |    linkedAccount: {           |                                |
  |      id, type, identifier,    |                                |
  |      verified                 |                                |
  |    },                         |                                |
  |    accessibleProfiles: [...]  |                                |
  |   }                           |                                |
```

### Validation Steps
1. **Current Account Verification**
   - Must be authenticated
   - Must be verified (except guest accounts)
   - Must have valid session

2. **Target Account Validation**
   - Creates if doesn't exist
   - Checks if already linked to another identity
   - Prevents circular links

3. **Link Creation**
   - Uses consistent ordering (sort IDs)
   - Prevents duplicate links
   - Sets privacy mode

### Error Cases
```json
// 403 - Unverified account
{
  "success": false,
  "error": "Please verify your account before linking other accounts"
}

// 409 - Already linked
{
  "success": false,
  "error": "Accounts are already linked"
}

// 409 - Target linked elsewhere
{
  "success": false,
  "error": "Target account is already linked to another identity"
}
```

---

## Identity Graph Queries

### Request
```
GET /api/v2/auth/identity-graph
Headers:
  Authorization: Bearer <accessToken>
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- GET /api/v2/auth/           |                                |
  |   identity-graph ------------>|                                |
  |                               |-- Get account from JWT ------->|
  |                               |-- Find all IdentityLinks ----->|
  |                               |   WHERE accountA OR accountB   |
  |                               |   = current account            |
  |                               |-- Respect privacy modes ------>|
  |                               |   Filter isolated links        |
  |                               |-- Build account list --------->|
  |                               |-- Get account details -------->|
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    accounts: [                |                                |
  |      {id, type, identifier}   |                                |
  |    ],                         |                                |
  |    links: [                   |                                |
  |      {accountAId, accountBId, |                                |
  |       linkType, privacyMode}  |                                |
  |    ],                         |                                |
  |    currentAccountId: "..."    |                                |
  |   }                           |                                |
```

### Graph Traversal Rules
- Starts from current account
- Follows links where privacyMode != 'isolated'
- Returns all connected accounts
- Includes link metadata

---

## Update Link Privacy Mode

### Request
```
PUT /api/v2/auth/link-privacy
Headers:
  Authorization: Bearer <accessToken>
Body:
{
  "targetAccountId": "account123",
  "privacyMode": "partial"  // "linked", "partial", "isolated"
}
```

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- PUT /api/v2/auth/           |                                |
  |   link-privacy -------------->|                                |
  |   {targetAccountId: "123",    |-- Find IdentityLink ---------->|
  |    privacyMode: "partial"}    |   between current & target     |
  |                               |-- Update privacyMode --------->|
  |                               |   {privacyMode: "partial"}     |
  |<-- 200 OK --------------------|                                |
  |   {success: true,             |                                |
  |    link: {updated link}}      |                                |
```

### Privacy Mode Effects

#### `linked` (Full Sharing)
```
- All profiles visible across accounts
- Full read/write access
- Changes sync everywhere
- Default for new links
```

#### `partial` (Selective Sharing)
```
- Limited profile visibility
- Read-only access to some data
- Selective sync
- Custom permissions possible
```

#### `isolated` (No Sharing)
```
- No profile sharing
- Independent sessions
- Link exists but inactive
- Can be reactivated later
```

---

## Profile Sharing Across Linked Accounts

### How Profile Access Works
```
getAccessibleProfiles(accountId) {
  1. Get all linked accounts via identity graph
  2. Filter by privacy mode (!= 'isolated')
  3. Get ProfileAccount records for all accounts
  4. Load unique profiles
  5. Return deduplicated list
}
```

### Example Scenario
```
User has:
- Email Account (A1) with Profile P1
- Wallet Account (A2) with Profile P2
- Link between A1 ↔ A2 (privacyMode: "linked")

Result:
- Login with A1 sees: [P1, P2]
- Login with A2 sees: [P1, P2]
- Can switch between profiles
- Can modify both profiles
```

### Profile Access Matrix by Privacy Mode

| Privacy Mode | Own Profiles | Linked Profiles | Operations |
|-------------|--------------|-----------------|------------|
| linked | Full access | Full access | All operations |
| partial | Full access | Read + limited write | Based on permissions |
| isolated | Full access | No access | None |

---

## Unlinking Accounts

Currently, the V2 API doesn't provide a direct unlink endpoint. To effectively unlink:

### Option 1: Set Privacy Mode to Isolated
```
PUT /api/v2/auth/link-privacy
{
  "targetAccountId": "account123",
  "privacyMode": "isolated"
}
```

This maintains the link but prevents any data sharing.

### Option 2: Database Operation (Admin Only)
```sql
-- Soft delete approach
UPDATE "IdentityLink" 
SET "privacyMode" = 'isolated',
    "updatedAt" = NOW()
WHERE ("accountAId" = 'A1' AND "accountBId" = 'A2')
   OR ("accountAId" = 'A2' AND "accountBId" = 'A1');
```

---

## Security Considerations

### Link Authorization
- Only verified accounts can create links
- Guest accounts have limited linking ability
- Each link requires active session
- All links are audited

### Attack Prevention
1. **Account Takeover Protection**
   - Can't link to already-linked accounts
   - Verification required before linking
   - Audit trail for all operations

2. **Privacy Protection**
   - Privacy modes enforce boundaries
   - Isolated mode stops all sharing
   - Users control their data flow

3. **Rate Limiting**
   - Link operations are rate-limited
   - Prevents spam linking
   - Based on account ID

---

## Common Integration Patterns

### Multi-Method Authentication
```javascript
// 1. User signs up with email
POST /api/v2/auth/authenticate
{ strategy: "email", ... }

// 2. Later, links wallet
POST /api/v2/auth/link-accounts
{ targetType: "wallet", targetIdentifier: "0x..." }

// 3. Can now login with either method
// Both see same profiles
```

### Social Login Addition
```javascript
// 1. Existing email user
// 2. Links Google account
POST /api/v2/auth/link-accounts
{ 
  targetType: "social",
  targetIdentifier: "google-user-id",
  targetProvider: "google"
}

// 3. Next time, can use "Sign in with Google"
```

### Privacy Mode Migration
```javascript
// Start with full sharing
{ privacyMode: "linked" }

// User wants more privacy
PUT /api/v2/auth/link-privacy
{ privacyMode: "partial" }

// Complete isolation if needed
PUT /api/v2/auth/link-privacy
{ privacyMode: "isolated" }
```

---

## Database Schema Reference

### IdentityLink Table
```
IdentityLink {
  accountAId: string (FK)
  accountBId: string (FK)
  linkType: "direct" | "inferred"
  privacyMode: "linked" | "partial" | "isolated"
  metadata: JSON
  createdAt: DateTime
  updatedAt: DateTime
}

Unique constraint: (accountAId, accountBId)
```

### Account Table (relevant fields)
```
Account {
  id: string (PK)
  type: "email" | "wallet" | "social" | "guest"
  identifier: string
  provider: string?
  verified: boolean
  metadata: JSON
}

Unique constraint: (type, identifier)
```