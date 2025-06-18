# AI AGENT INTEGRATION GUIDE - INTERSPACE BACKEND

**Document Type**: AI Agent Reference  
**Version**: 1.0.0  
**Purpose**: Complete guide for AI agents working with Interspace backend

## QUICK START FOR AI AGENTS

### 1. Understanding the System
```bash
# Primary documentation to read in order:
1. /docs/ai-agents/AI_AGENT_PROJECT_OVERVIEW.md    # System architecture
2. /docs/ai-agents/AI_AGENT_API_REFERENCE.md       # API specifications
3. /docs/ai-agents/AI_AGENT_DATABASE_SCHEMA.md     # Database structure
4. /docs/ai-agents/AI_AGENT_DEPLOYMENT_ARCHITECTURE.md  # Infrastructure
```

### 2. Common Tasks

#### Check System Status
```bash
# Local development
curl http://localhost:3000/health

# Production
curl https://api.interspace.fi/health
```

#### Database Operations
```typescript
// Connection string from environment
const DATABASE_URL = process.env.DATABASE_URL;

// Use Prisma client
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
```

#### Authentication Flow
```typescript
// 1. Login endpoint
POST /api/v1/auth/mpc/login
{
  "publicKey": "0x...",
  "signature": "0x...",
  "message": "Login message",
  "deviceId": "uuid"
}

// 2. Use returned JWT
Authorization: Bearer {accessToken}
```

## FILE LOCATION REFERENCE

### Core Business Logic
```
/src/services/
├── mpcKeyShareService.ts      # MPC wallet operations
├── smartProfileService.ts     # Profile management
├── orbyService.ts            # Chain abstraction
├── passkeyService.ts         # Passkey auth
├── socialAuthService.ts      # Social login
├── emailService.ts           # Email notifications
└── auditService.ts           # Security logging
```

### API Controllers
```
/src/controllers/
├── authController.ts         # Authentication endpoints
├── smartProfileController.ts # Profile CRUD
├── linkedAccountController.ts # Wallet linking
├── orbyController.ts         # Orby operations
├── mpcController.ts          # MPC key management
└── emailAuthController.ts    # Email verification
```

### Configuration
```
/src/utils/
├── config.ts                 # Environment config
├── database.ts              # Database connection
├── logger.ts                # Winston logger
├── errors.ts                # Error classes
└── asyncHandler.ts          # Async utilities
```

## INTEGRATION PATTERNS

### 1. MPC Key Generation
```typescript
// Location: src/controllers/mpcController.ts:45
async function generateMPCKey(req, res) {
  // 1. Validate user authentication
  // 2. Check existing keys
  // 3. Call Silence Labs API
  // 4. Store key mapping
  // 5. Return public key
}
```

### 2. Profile Creation
```typescript
// Location: src/services/smartProfileService.ts:78
async function createProfile(data) {
  // 1. Validate input
  // 2. Create session wallet
  // 3. Create Orby cluster
  // 4. Save to database
  // 5. Return profile
}
```

### 3. Transaction Execution
```typescript
// Location: src/services/orbyService.ts:156
async function createIntent(profileId, params) {
  // 1. Get account cluster
  // 2. Build operations
  // 3. Estimate gas
  // 4. Return unsigned payload
}
```

## ERROR HANDLING

### Standard Error Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Common Error Codes
- `AUTH001-AUTH004`: Authentication errors
- `MPC001-MPC003`: MPC operation errors
- `PROFILE001-PROFILE003`: Profile errors
- `ORBY001-ORBY003`: Chain abstraction errors
- `VALIDATION001-002`: Input validation errors

## ENVIRONMENT CONFIGURATION

### Required Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Authentication
JWT_SECRET=<32+ char secret>
JWT_REFRESH_SECRET=<32+ char secret>

# MPC
SILENCE_ADMIN_TOKEN=<from Silence Labs>
SILENCE_BACKEND_URL=<duo server URL>

# Orby
ORBY_API_URL=https://api.orby.fi
ORBY_API_KEY=<api key>
ORBY_INSTANCE_URL=<instance URL>

# Email
SENDGRID_API_KEY=<sendgrid key>
EMAIL_FROM=noreply@interspace.fi

# Security
ENCRYPTION_SECRET=<32 char hex>
```

### Development Overrides
```bash
# Enable mocks
MOCK_SESSION_WALLET=true
BYPASS_LOGIN=true
DEV_USER_EMAIL=dev@test.com
```

## DEPLOYMENT COMMANDS

### Local Development
```bash
# Start all services
docker-compose -f docker-compose.local.yml up

# Run migrations
npm run prisma:migrate

# Start server
npm run dev
```

### Production Deployment
```bash
# Deploy to development
gcloud builds submit --config=cloudbuild.dev.yaml

# Deploy to production
gcloud builds submit --config=cloudbuild.prod.yaml

# Check deployment
gcloud run services describe interspace-backend-prod
```

## TESTING

### Run Tests
```bash
# All tests
npm test

# Specific test
npm test -- auth.test.ts

# Integration tests
npm run test:integration
```

### Test Database
```bash
# Use test environment
DATABASE_URL=postgresql://localhost:5432/test
NODE_ENV=test
```

## MONITORING

### Key Metrics
- API response time: Target <200ms p95
- Error rate: Target <0.1%
- Database pool: Monitor connections
- Memory usage: Watch for leaks

### Log Locations
- Local: `./logs/` directory
- Production: Google Cloud Logging

### Health Endpoints
```bash
GET /health          # Basic health
GET /health/detailed # Detailed status
```

## COMMON ISSUES

### Database Connection
```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1"

# Reset connections
npm run prisma:generate
```

### Authentication Failures
- Check JWT expiration
- Verify token not blacklisted
- Confirm device registration

### MPC Errors
- Verify Silence Labs connectivity
- Check admin token validity
- Review key rotation status

## SECURITY NOTES

### Never Do
- Log sensitive data (keys, tokens)
- Disable encryption
- Skip authentication checks
- Use BYPASS_LOGIN in production

### Always Do
- Validate all inputs
- Use parameterized queries
- Encrypt sensitive fields
- Audit security events

## USEFUL COMMANDS

### Database
```bash
# Open Prisma Studio
npm run prisma:studio

# Create migration
npm run prisma:migrate:dev

# Reset database
npm run prisma:reset
```

### Code Quality
```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

### Deployment
```bash
# Check infrastructure
./scripts/gcp-infrastructure.sh status

# Deploy service
./scripts/gcp-deploy.sh prod

# Manage secrets
./scripts/gcp-secrets.sh list
```

---

**Note**: This guide is specifically formatted for AI agent consumption. All paths are absolute from project root. Use exact file locations and line numbers when available.