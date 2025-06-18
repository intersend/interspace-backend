# LOCAL DEVELOPMENT GUIDE

**Purpose**: Quick setup for local development  
**Time Required**: 10-15 minutes  
**Prerequisites**: Node.js 18+, Docker

## Quick Start

### 1. Clone and Install
```bash
git clone https://github.com/intersend/interspace-backend.git
cd interspace-backend
npm install
```

### 2. Environment Setup
```bash
# Copy example environment
cp .env.example .env.development

# Key variables to configure:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/interspace_dev"
JWT_SECRET="development-secret-change-in-production"
MOCK_SESSION_WALLET=true
BYPASS_LOGIN=true  # For development only
```

### 3. Start Services

#### Option A: Full Docker Setup (Recommended)
```bash
# Start everything with Docker
./scripts/local-dev.sh start

# Or manually:
docker-compose -f docker-compose.local.yml --profile local up --build
```

#### Option B: Manual Setup
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Run migrations
npm run prisma:generate
npm run prisma:migrate

# Start development server
npm run dev
```

## Development Configuration

### Essential Environment Variables
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/interspace_dev

# JWT (use strong secrets in production)
JWT_SECRET=dev-secret-123
JWT_REFRESH_SECRET=dev-refresh-secret-123

# Development Features
MOCK_SESSION_WALLET=true  # Use mock blockchain
BYPASS_LOGIN=true         # Skip auth for testing
DEV_USER_EMAIL=dev@interspace.test

# External Services (optional for basic development)
SILENCE_ADMIN_TOKEN=dummy-token
ORBY_API_KEY=dummy-key
SENDGRID_API_KEY=dummy-key
```

### Mock Services

The following services have mock implementations for development:
- **Session Wallet**: Returns mock addresses
- **MPC Operations**: Simulated key generation
- **Email Service**: Logs to console
- **Orby Integration**: Returns dummy data

## Common Development Tasks

### 1. Database Management
```bash
# View database in Prisma Studio
npm run prisma:studio

# Reset database
npm run prisma:reset

# Create new migration
npm run prisma:migrate:dev -- --name your_migration_name
```

### 2. Testing
```bash
# Run all tests
npm test

# Run specific test file
npm test auth.test.ts

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### 3. Code Quality
```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# All checks (before committing)
npm run check
```

## API Testing

### Using HTTPie
```bash
# Health check
http GET localhost:3000/health

# Get profiles (with bypass login)
http GET localhost:3000/api/v1/profiles

# Create profile
http POST localhost:3000/api/v1/profiles \
  name="Test Profile" \
  type="TRADING"
```

### Using cURL
```bash
# Login with bypass
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@interspace.test"}'

# Use the returned token
TOKEN="your-jwt-token"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/profiles
```

### Postman Collection
Import `docs/postman/interspace-api.json` for complete API collection.

## Debugging

### VS Code Configuration
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/src/index.ts",
      "preLaunchTask": "tsc: build - tsconfig.json",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "envFile": "${workspaceFolder}/.env.development"
    }
  ]
}
```

### Logging
```typescript
// Use the logger utility
import logger from './utils/logger';

logger.info('Server started', { port: 3000 });
logger.error('Database error', { error: err });
logger.debug('Debug info', { data: someData });
```

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port 3000
   lsof -i :3000
   # Kill process
   kill -9 <PID>
   ```

2. **Database Connection Failed**
   ```bash
   # Check PostgreSQL is running
   docker ps
   # Restart PostgreSQL
   docker-compose restart postgres
   ```

3. **Prisma Client Out of Sync**
   ```bash
   # Regenerate Prisma client
   npm run prisma:generate
   ```

## Performance Optimization

### Development Settings
```typescript
// Disable in development for faster startup
export const config = {
  rateLimiting: process.env.NODE_ENV === 'production',
  clustering: false, // Always false in dev
  caching: false,    // Disable Redis in dev
}
```

### Hot Reloading
The development server uses `nodemon` for automatic reloading:
- Watches all `.ts` files in `src/`
- Ignores `node_modules/` and `dist/`
- Restarts on file changes

## Seed Data

### Create Test Data
```bash
# Run seed script
npm run seed

# Or manually in Prisma Studio
npm run prisma:studio
```

### Test Users
With `BYPASS_LOGIN=true`:
- Email: `dev@interspace.test`
- Auto-creates user on first login
- No password required

## Next Steps

1. Review [API Documentation](../technical/API_DOCUMENTATION.md)
2. Check [Architecture Overview](../technical/ARCHITECTURE_OVERVIEW.md)
3. Read [Frontend Integration Guide](./FRONTEND_INTEGRATION.md)
4. Explore [Testing Strategy](../technical/TESTING_STRATEGY.md)

---

**Pro Tips**:
- Use `BYPASS_LOGIN=true` for rapid development
- Keep `docker-compose up` running for services
- Run `npm run check` before committing
- Use Prisma Studio for database inspection