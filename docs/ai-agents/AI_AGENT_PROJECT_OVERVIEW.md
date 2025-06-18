# AI AGENT PROJECT OVERVIEW - INTERSPACE BACKEND

**Document Type**: AI Agent Reference  
**Version**: 1.0.0  
**Last Updated**: 2025-06-18

## PROJECT IDENTIFICATION

```json
{
  "project_name": "interspace-backend",
  "project_type": "Node.js TypeScript API",
  "primary_function": "Multi-Party Computation (MPC) wallet backend with SmartProfiles",
  "deployment_target": "Google Cloud Platform",
  "database": "PostgreSQL with Prisma ORM",
  "authentication": "JWT with MPC key shares"
}
```

## DIRECTORY STRUCTURE

```
/interspace-backend/
├── src/
│   ├── index.ts                    # Entry point, Express server configuration
│   ├── controllers/                # Request handlers
│   │   ├── authController.ts      # MPC authentication, JWT management
│   │   ├── smartProfileController.ts # SmartProfile CRUD operations
│   │   ├── linkedAccountController.ts # External wallet linking
│   │   ├── orbyController.ts      # Chain abstraction operations
│   │   ├── mpcController.ts       # MPC key generation and operations
│   │   └── emailAuthController.ts # Email verification flows
│   ├── services/                   # Business logic
│   │   ├── mpcKeyShareService.ts  # MPC key management
│   │   ├── orbyService.ts         # Orby integration
│   │   ├── smartProfileService.ts # Profile management
│   │   ├── passkeyService.ts      # Passkey authentication
│   │   ├── socialAuthService.ts   # Social login integration
│   │   ├── emailService.ts        # Email notifications
│   │   └── auditService.ts        # Security audit logging
│   ├── blockchain/                 # Blockchain interactions
│   │   ├── sessionWalletService.ts # ERC-7702 session wallets
│   │   └── mockSessionWalletService.ts # Development mock
│   ├── middleware/                 # Express middleware
│   │   ├── auth.ts                # JWT verification
│   │   ├── errorHandler.ts        # Global error handling
│   │   └── rateLimiter.ts         # Rate limiting
│   ├── routes/                     # API route definitions
│   │   ├── authRoutes.ts          # /api/v1/auth/*
│   │   ├── smartProfileRoutes.ts  # /api/v1/profiles/*
│   │   ├── linkedAccountRoutes.ts # /api/v1/accounts/*
│   │   ├── orbyRoutes.ts          # /api/v1/orby/*
│   │   ├── mpcRoutes.ts           # /api/v1/mpc/*
│   │   └── emailAuthRoutes.ts     # /api/v1/email/*
│   ├── types/                      # TypeScript definitions
│   │   └── index.ts               # Shared types and interfaces
│   └── utils/                      # Utility functions
│       ├── config.ts              # Environment configuration
│       ├── database.ts            # Database connection
│       ├── logger.ts              # Winston logger setup
│       ├── errors.ts              # Custom error classes
│       └── asyncHandler.ts        # Async route wrapper
├── prisma/
│   ├── schema.prisma              # Database schema definition
│   └── migrations/                # Database migrations
├── tests/                         # Test suites
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── setup.ts                   # Test configuration
├── scripts/                       # Automation scripts
│   ├── gcp-deploy.sh             # GCP deployment
│   ├── gcp-infrastructure.sh     # Infrastructure management
│   └── gcp-secrets.sh            # Secrets management
└── cloudbuild/                    # GCP Cloud Build configs
    ├── cloudbuild.dev.yaml       # Development deployment
    └── cloudbuild.prod.yaml      # Production deployment
```

## CORE COMPONENTS

### 1. MPC WALLET SYSTEM
**Location**: `src/services/mpcKeyShareService.ts`
**Purpose**: Multi-Party Computation key management
**Key Methods**:
- `createMPCKeyShare()`: Generate new MPC key shares
- `getMPCKeyShareForUser()`: Retrieve user's key share
- `rotateMPCKeyShare()`: Key rotation for security

### 2. SMARTPROFILE MANAGEMENT
**Location**: `src/services/smartProfileService.ts`
**Purpose**: User profile and wallet grouping
**Key Methods**:
- `createProfile()`: Create new SmartProfile
- `linkAccount()`: Link external wallets
- `createSessionWallet()`: Deploy ERC-7702 proxy

### 3. SESSION WALLET SERVICE
**Location**: `src/blockchain/sessionWalletService.ts`
**Purpose**: ERC-7702 session wallet operations
**Supported Chains**:
```json
{
  "ethereum": { "chainId": 1, "rpc": "mainnet.infura.io" },
  "polygon": { "chainId": 137, "rpc": "polygon-mainnet" },
  "arbitrum": { "chainId": 42161, "rpc": "arb-mainnet" },
  "optimism": { "chainId": 10, "rpc": "optimism-mainnet" },
  "base": { "chainId": 8453, "rpc": "base-mainnet" }
}
```

### 4. ORBY INTEGRATION
**Location**: `src/services/orbyService.ts`
**Purpose**: Chain abstraction and gas sponsorship
**Key Features**:
- Account cluster management
- Cross-chain intent building
- Gas estimation and sponsorship

## DATABASE SCHEMA

### Primary Tables
```sql
-- Users table
User {
  id: String (uuid)
  mpcPublicKey: String? (unique)
  email: String? (unique)
  emailVerified: Boolean
  appleId: String? (unique)
  googleId: String? (unique)
  createdAt: DateTime
  updatedAt: DateTime
}

-- MPC Key Shares
MPCKeyShare {
  id: String (uuid)
  userId: String (FK -> User)
  keyShareData: String (encrypted)
  publicKey: String
  keyShareHash: String (unique)
  deviceId: String
  createdAt: DateTime
  lastUsed: DateTime?
  rotatedAt: DateTime?
}

-- Smart Profiles
SmartProfile {
  id: String (uuid)
  name: String
  type: ProfileType (enum)
  imageUrl: String?
  sessionWalletAddress: String
  sessionWalletChainId: Int
  eoaAddress: String (unique)
  userId: String (FK -> User)
  orbyAccountId: String?
  createdAt: DateTime
  updatedAt: DateTime
}

-- Linked Accounts
LinkedAccount {
  id: String (uuid)
  address: String
  walletType: WalletType (enum)
  chainId: Int
  smartProfileId: String (FK -> SmartProfile)
  createdAt: DateTime
}
```

## API ENDPOINTS

### Authentication
```
POST   /api/v1/auth/mpc/login         # MPC key login
POST   /api/v1/auth/mpc/register      # New MPC registration
POST   /api/v1/auth/refresh           # Token refresh
POST   /api/v1/auth/logout            # Logout and blacklist token
POST   /api/v1/auth/siwe              # Sign-In with Ethereum
POST   /api/v1/auth/social/google     # Google OAuth
POST   /api/v1/auth/social/apple      # Apple Sign-In
```

### SmartProfiles
```
GET    /api/v1/profiles               # List user profiles
POST   /api/v1/profiles               # Create profile
GET    /api/v1/profiles/:id           # Get profile details
PUT    /api/v1/profiles/:id           # Update profile
DELETE /api/v1/profiles/:id           # Delete profile
POST   /api/v1/profiles/:id/accounts  # Link account
DELETE /api/v1/profiles/:id/accounts/:accountId # Unlink
```

### MPC Operations
```
POST   /api/v1/mpc/generate           # Generate MPC key
POST   /api/v1/mpc/export             # Export key share
POST   /api/v1/mpc/rotate             # Rotate key share
GET    /api/v1/mpc/status             # Check MPC status
```

## ENVIRONMENT VARIABLES

### Required Variables
```bash
# Database
DATABASE_URL                # PostgreSQL connection string

# JWT
JWT_SECRET                  # Access token secret
JWT_REFRESH_SECRET          # Refresh token secret
JWT_EXPIRATION             # Access token expiry (default: 15m)
JWT_REFRESH_EXPIRATION     # Refresh expiry (default: 7d)

# MPC
SILENCE_ADMIN_TOKEN        # Silence Labs API token
SILENCE_BACKEND_URL        # MPC backend URL

# Orby
ORBY_API_URL              # Orby API endpoint
ORBY_API_KEY              # Orby API key
ORBY_INSTANCE_URL         # Orby instance URL

# Email
SENDGRID_API_KEY          # SendGrid API key
EMAIL_FROM                # Sender email address

# Security
ENCRYPTION_SECRET         # Data encryption key
BYPASS_LOGIN              # Development bypass (never in prod)
```

## SECURITY FEATURES

### 1. Authentication
- JWT with access/refresh token pattern
- MPC key-based authentication
- Social login with account linking
- Email verification required

### 2. Authorization
- Profile-based access control
- Device fingerprinting
- Session management

### 3. Data Protection
- Field-level encryption for sensitive data
- Audit logging with integrity checks
- Rate limiting per user/IP
- Input sanitization

### 4. Network Security
- VPC isolation for internal services
- No public database access
- TLS/SSL everywhere
- CORS with strict origins

## DEPLOYMENT

### Infrastructure
```yaml
platform: Google Cloud Platform
regions: 
  - primary: us-central1
  - backup: us-central1 (multi-zone)
services:
  - Cloud Run (backend, duo-node)
  - Cloud SQL PostgreSQL (dev, prod)
  - Memorystore Redis (dev, prod)
  - VPC with private networking
  - Secret Manager for credentials
```

### CI/CD Pipeline
1. GitHub push triggers Cloud Build
2. Run tests and security checks
3. Build Docker container
4. Deploy to Cloud Run
5. Gradual traffic migration
6. Health checks and monitoring

## INTEGRATION POINTS

### 1. Silence Labs MPC
- Admin API for key generation
- TSS operations for signing
- Key rotation and recovery

### 2. Orby Chain Abstraction
- Account cluster creation
- Intent building for transactions
- Gas sponsorship

### 3. External Wallets
- MetaMask connection
- WalletConnect support
- Coinbase Wallet
- Rainbow Wallet

### 4. Frontend (React Native)
- REST API communication
- JWT token management
- Real-time updates via polling

## ERROR CODES

```json
{
  "AUTH001": "Invalid credentials",
  "AUTH002": "Token expired",
  "AUTH003": "Insufficient permissions",
  "MPC001": "Key generation failed",
  "MPC002": "Invalid key share",
  "PROFILE001": "Profile not found",
  "PROFILE002": "Duplicate profile name",
  "ORBY001": "Chain abstraction failed",
  "ORBY002": "Insufficient balance"
}
```

## MONITORING

### Key Metrics
- API response time (target: <200ms p95)
- Error rate (target: <0.1%)
- MPC operation success rate
- Database connection pool health
- Memory usage and GC cycles

### Logging
- Winston logger with structured logs
- Log levels: error, warn, info, debug
- Centralized in Google Cloud Logging
- Audit trail for security events

---

**Usage Note**: This document is optimized for AI agent consumption. Use exact file paths and method names when referencing code. All paths are relative to project root.