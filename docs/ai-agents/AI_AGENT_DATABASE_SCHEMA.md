# AI AGENT DATABASE SCHEMA - INTERSPACE BACKEND

**Document Type**: AI Agent Database Reference  
**Version**: 1.0.0  
**Database**: PostgreSQL with Prisma ORM  
**Schema Location**: `/prisma/schema.prisma`

## DATABASE CONNECTION

```json
{
  "provider": "postgresql",
  "connection_env": "DATABASE_URL",
  "migration_tool": "Prisma Migrate",
  "client_generator": "prisma-client-js"
}
```

## CORE TABLES

### 1. USER MANAGEMENT

#### Table: users
```sql
{
  "primary_key": "id (cuid)",
  "unique_constraints": ["email"],
  "indexes": [],
  "fields": {
    "id": "String @id @default(cuid())",
    "email": "String? @unique",
    "hashedPassword": "String? // For traditional auth",
    "emailVerified": "Boolean @default(false)",
    "authStrategies": "String? // JSON array",
    "isGuest": "Boolean @default(false)",
    "walletAddress": "String? // Primary SIWE address",
    "twoFactorEnabled": "Boolean @default(false)",
    "twoFactorSecret": "String? // Encrypted TOTP",
    "twoFactorBackupCodes": "String? // Encrypted JSON",
    "createdAt": "DateTime @default(now())",
    "updatedAt": "DateTime @updatedAt"
  },
  "relationships": {
    "devices": "DeviceRegistration[] (one-to-many)",
    "refreshTokens": "RefreshToken[] (one-to-many)",
    "blacklistedTokens": "BlacklistedToken[] (one-to-many)",
    "smartProfiles": "SmartProfile[] (one-to-many)",
    "linkedAccounts": "LinkedAccount[] (one-to-many)",
    "socialProfiles": "SocialProfile[] (one-to-many)",
    "emailVerifications": "EmailVerification[] (one-to-many)"
  }
}
```

#### Table: device_registrations
```sql
{
  "primary_key": "id",
  "unique_constraints": ["deviceId"],
  "foreign_keys": ["userId -> users.id CASCADE"],
  "fields": {
    "id": "String @id @default(cuid())",
    "userId": "String (FK)",
    "deviceId": "String @unique",
    "deviceName": "String",
    "deviceType": "String // ios|android|web",
    "fingerprint": "String?",
    "lastActiveAt": "DateTime @default(now())",
    "isActive": "Boolean @default(true)"
  }
}
```

### 2. AUTHENTICATION & SECURITY

#### Table: refresh_tokens
```sql
{
  "primary_key": "id",
  "unique_constraints": ["token"],
  "indexes": ["familyId"],
  "foreign_keys": ["userId -> users.id CASCADE"],
  "fields": {
    "id": "String @id",
    "userId": "String (FK)",
    "token": "String @unique",
    "familyId": "String? // Token rotation tracking",
    "expiresAt": "DateTime",
    "rotatedAt": "DateTime?"
  }
}
```

#### Table: blacklisted_tokens
```sql
{
  "primary_key": "id",
  "unique_constraints": ["token"],
  "indexes": ["expiresAt"],
  "foreign_keys": ["userId -> users.id CASCADE"],
  "fields": {
    "id": "String @id",
    "token": "String @unique",
    "tokenType": "String // access|refresh",
    "userId": "String (FK)",
    "reason": "String // logout|rotation|security|password_change",
    "expiresAt": "DateTime"
  }
}
```

#### Table: siwe_nonces
```sql
{
  "primary_key": "id",
  "unique_constraints": ["nonce"],
  "indexes": ["expiresAt"],
  "fields": {
    "id": "String @id",
    "nonce": "String @unique",
    "createdAt": "DateTime @default(now())",
    "expiresAt": "DateTime",
    "usedAt": "DateTime?"
  }
}
```

### 3. SMART PROFILES

#### Table: smart_profiles
```sql
{
  "primary_key": "id",
  "unique_constraints": ["sessionWalletAddress", "orbyAccountClusterId"],
  "foreign_keys": ["userId -> users.id CASCADE"],
  "fields": {
    "id": "String @id @default(cuid())",
    "userId": "String (FK)",
    "name": "String",
    "sessionWalletAddress": "String @unique // ERC-7702",
    "isActive": "Boolean @default(false)",
    "isDevelopmentWallet": "Boolean @default(false)",
    "orbyAccountClusterId": "String? @unique"
  },
  "relationships": {
    "linkedAccounts": "LinkedAccount[]",
    "folders": "Folder[]",
    "apps": "BookmarkedApp[]",
    "transactions": "Transaction[]",
    "mpcKeyShare": "MpcKeyShare?",
    "mpcKeyMapping": "MpcKeyMapping?"
  }
}
```

#### Table: linked_accounts
```sql
{
  "primary_key": "id",
  "unique_constraints": ["[userId, address, profileId]"],
  "foreign_keys": [
    "userId -> users.id CASCADE",
    "profileId -> smart_profiles.id SET NULL"
  ],
  "fields": {
    "id": "String @id",
    "userId": "String (FK)",
    "profileId": "String? (FK)",
    "address": "String // EOA address",
    "authStrategy": "String // wallet|social",
    "walletType": "String? // metamask|coinbase|walletconnect",
    "customName": "String?",
    "isPrimary": "Boolean @default(false)",
    "chainId": "Int?",
    "metadata": "String? // JSON"
  }
}
```

### 4. MPC KEY MANAGEMENT

#### Table: mpc_key_shares
```sql
{
  "primary_key": "id",
  "unique_constraints": ["profileId"],
  "foreign_keys": ["profileId -> smart_profiles.id CASCADE"],
  "fields": {
    "id": "String @id",
    "profileId": "String @unique (FK)",
    "serverShare": "String // Encrypted server key share",
    "createdAt": "DateTime",
    "updatedAt": "DateTime"
  }
}
```

#### Table: mpc_key_mappings
```sql
{
  "primary_key": "id",
  "unique_constraints": ["profileId", "silenceLabsKeyId"],
  "foreign_keys": ["profileId -> smart_profiles.id CASCADE"],
  "fields": {
    "id": "String @id",
    "profileId": "String @unique (FK)",
    "silenceLabsKeyId": "String @unique",
    "publicKey": "String",
    "keyAlgorithm": "String @default('ecdsa') // ecdsa|schnorr"
  }
}
```

### 5. ORBY INTEGRATION

#### Table: orby_operations
```sql
{
  "primary_key": "id",
  "unique_constraints": ["operationSetId"],
  "foreign_keys": ["profileId -> smart_profiles.id CASCADE"],
  "fields": {
    "id": "String @id",
    "profileId": "String (FK)",
    "operationSetId": "String @unique",
    "type": "String // swap|transfer|sign",
    "status": "String // created|signed|pending|successful|failed",
    "unsignedPayload": "String // JSON",
    "signedPayload": "String? // JSON",
    "gasToken": "String? // JSON",
    "metadata": "String // JSON",
    "completedAt": "DateTime?"
  }
}
```

#### Table: orby_virtual_nodes
```sql
{
  "primary_key": "id",
  "unique_constraints": ["[profileId, chainId]"],
  "foreign_keys": ["profileId -> smart_profiles.id CASCADE"],
  "fields": {
    "id": "String @id",
    "profileId": "String (FK)",
    "chainId": "Int",
    "rpcUrl": "String",
    "address": "String // Injected address",
    "isActive": "Boolean @default(true)"
  }
}
```

### 6. TRANSACTIONS

#### Table: transactions
```sql
{
  "primary_key": "id",
  "unique_constraints": ["hash"],
  "foreign_keys": ["profileId -> smart_profiles.id CASCADE"],
  "fields": {
    "id": "String @id",
    "profileId": "String (FK)",
    "hash": "String @unique",
    "chainId": "Int",
    "fromAddress": "String",
    "toAddress": "String",
    "value": "BigInt",
    "gasUsed": "BigInt?",
    "status": "String // pending|confirmed|failed",
    "blockNumber": "Int?",
    "routingType": "String? // direct|session_wallet|batch",
    "sourceAccount": "String? // Original EOA",
    "sessionWallet": "String? // Executor wallet",
    "input": "String? // TX data",
    "logs": "String? // JSON logs"
  }
}
```

### 7. APP MANAGEMENT

#### Table: folders
```sql
{
  "primary_key": "id",
  "unique_constraints": ["shareableId"],
  "foreign_keys": ["profileId -> smart_profiles.id CASCADE"],
  "fields": {
    "id": "String @id",
    "profileId": "String (FK)",
    "name": "String",
    "position": "Int @default(0)",
    "isPublic": "Boolean @default(false)",
    "shareableId": "String? @unique",
    "color": "String?"
  }
}
```

#### Table: bookmarked_apps
```sql
{
  "primary_key": "id",
  "foreign_keys": [
    "profileId -> smart_profiles.id CASCADE",
    "folderId -> folders.id SET NULL"
  ],
  "fields": {
    "id": "String @id",
    "profileId": "String (FK)",
    "folderId": "String? (FK)",
    "name": "String",
    "url": "String",
    "iconUrl": "String?",
    "position": "Int @default(0)"
  }
}
```

### 8. SOCIAL & EMAIL

#### Table: social_profiles
```sql
{
  "primary_key": "id",
  "unique_constraints": ["[userId, provider]", "[provider, providerId]"],
  "foreign_keys": ["userId -> users.id CASCADE"],
  "fields": {
    "id": "String @id",
    "userId": "String (FK)",
    "provider": "String // farcaster|telegram|twitter",
    "providerId": "String // External ID",
    "username": "String?",
    "displayName": "String?",
    "avatarUrl": "String?",
    "accessToken": "String? // Encrypted",
    "refreshToken": "String? // Encrypted"
  }
}
```

#### Table: email_verifications
```sql
{
  "primary_key": "id",
  "indexes": ["[email, code]", "expiresAt"],
  "foreign_keys": ["userId -> users.id CASCADE NULL"],
  "fields": {
    "id": "String @id",
    "email": "String",
    "code": "String // 6-digit code",
    "attempts": "Int @default(0)",
    "expiresAt": "DateTime",
    "lastAttemptAt": "DateTime?",
    "userId": "String? (FK)"
  }
}
```

### 9. AUDIT & SECURITY

#### Table: audit_logs
```sql
{
  "primary_key": "id",
  "foreign_keys": ["profileId -> smart_profiles.id SET NULL"],
  "fields": {
    "id": "String @id",
    "userId": "String?",
    "profileId": "String? (FK)",
    "action": "String // login|logout|key_rotation|transaction",
    "resource": "String // profile|account|mpc_key",
    "details": "String? // JSON",
    "ipAddress": "String?",
    "userAgent": "String?",
    "createdAt": "DateTime @default(now())"
  }
}
```

## ENUMS AND CONSTANTS

### ProfileType (enum)
```json
["TRADING", "GAMING", "DEFI", "SOCIAL", "NFT", "DEFAULT"]
```

### WalletType (enum)
```json
["METAMASK", "WALLETCONNECT", "COINBASE", "RAINBOW", "OTHER"]
```

### AuthStrategy (JSON array in users.authStrategies)
```json
["wallet", "social", "email", "passkey", "mpc"]
```

### DeviceType (device_registrations.deviceType)
```json
["ios", "android", "web"]
```

### TokenType (blacklisted_tokens.tokenType)
```json
["access", "refresh"]
```

### TransactionStatus
```json
["pending", "confirmed", "failed"]
```

## DATABASE OPERATIONS

### Common Queries
```typescript
// Get user with all profiles
prisma.user.findUnique({
  where: { id: userId },
  include: {
    smartProfiles: {
      include: {
        linkedAccounts: true,
        mpcKeyMapping: true
      }
    }
  }
})

// Get profile with full details
prisma.smartProfile.findUnique({
  where: { id: profileId },
  include: {
    linkedAccounts: true,
    folders: { include: { apps: true } },
    mpcKeyMapping: true,
    orbyVirtualNodes: true
  }
})

// Check token blacklist
prisma.blacklistedToken.findFirst({
  where: {
    token: jwtToken,
    expiresAt: { gt: new Date() }
  }
})
```

### Transaction Patterns
```typescript
// Create profile with MPC
prisma.$transaction(async (tx) => {
  const profile = await tx.smartProfile.create({...})
  const mpcMapping = await tx.mpcKeyMapping.create({...})
  const auditLog = await tx.auditLog.create({...})
  return { profile, mpcMapping }
})
```

## MIGRATIONS

### Migration Commands
```bash
# Generate migration
npx prisma migrate dev --name <migration_name>

# Apply migrations
npx prisma migrate deploy

# Reset database (CAUTION)
npx prisma migrate reset
```

### Migration History Location
```
/prisma/migrations/
├── 20240101000000_initial_schema/
├── 20250617134428_add_mpc_key_mapping/
├── 20250617185655_add_email_verification/
└── migration_lock.toml
```

## INDEXES AND PERFORMANCE

### Critical Indexes
1. `users.email` - Unique index for login
2. `refresh_tokens.familyId` - Token rotation detection
3. `blacklisted_tokens.expiresAt` - Cleanup queries
4. `siwe_nonces.expiresAt` - Nonce expiration
5. `email_verifications.[email,code]` - Verification lookup

### Query Optimization
- Use `select` to limit fields returned
- Use `include` sparingly for related data
- Implement pagination with `skip`/`take`
- Use raw queries for complex aggregations

---

**Usage Note**: All table names use snake_case in the database. Prisma client uses camelCase in code. Field types are PostgreSQL native types mapped through Prisma.