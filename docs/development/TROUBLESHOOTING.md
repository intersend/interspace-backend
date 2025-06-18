# TROUBLESHOOTING GUIDE

**Purpose**: Quick solutions to common issues  
**Target**: Development and operations teams

## Common Issues

### 1. Server Won't Start

#### Port Already in Use
```bash
# Error: EADDRINUSE: address already in use :::3000

# Solution:
lsof -i :3000  # Find process
kill -9 <PID>  # Kill process

# Or change port:
PORT=3001 npm run dev
```

#### Database Connection Failed
```bash
# Error: ECONNREFUSED 127.0.0.1:5432

# Solution:
docker-compose up -d postgres  # Start PostgreSQL
docker ps  # Verify it's running

# Check connection:
psql $DATABASE_URL -c "SELECT 1"
```

#### Prisma Client Out of Sync
```bash
# Error: PrismaClientInitializationError

# Solution:
npm run prisma:generate
npm run prisma:migrate
```

### 2. Authentication Issues

#### JWT Token Expired
```javascript
// Error: TokenExpiredError

// Solution: Refresh token
const response = await fetch('/api/v1/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken })
});
```

#### BYPASS_LOGIN Not Working
```bash
# Ensure environment variable is set
BYPASS_LOGIN=true npm run dev

# Check in code:
console.log(process.env.BYPASS_LOGIN)  // Should be "true"
```

#### MPC Login Fails
```
Error: Invalid signature

Solutions:
1. Check public key format (should start with 0x04)
2. Verify message matches exactly
3. Ensure signature is hex encoded
4. Check device ID is consistent
```

### 3. Database Problems

#### Migration Errors
```bash
# Error: P3009 migrate found failed migrations

# Solution:
npm run prisma:migrate:reset  # CAUTION: Drops all data
# Or manually fix:
npm run prisma:studio  # Check _prisma_migrations table
```

#### Connection Pool Exhausted
```
Error: Too many connections

Solutions:
1. Increase pool size in DATABASE_URL:
   ?connection_limit=10

2. Check for connection leaks:
   - Ensure prisma.$disconnect() in tests
   - Use single PrismaClient instance

3. Monitor connections:
   SELECT count(*) FROM pg_stat_activity;
```

### 4. API Errors

#### CORS Issues
```javascript
// Error: CORS policy blocked

// Solutions:
1. Check allowed origins in config:
   CORS_ORIGINS=http://localhost:3000,http://localhost:19006

2. For development, allow all:
   CORS_ORIGINS=*

3. Check preflight requests:
   curl -X OPTIONS http://localhost:3000/api/v1/profiles
```

#### Rate Limiting
```
Error: Too many requests (429)

Solutions:
1. Wait for rate limit reset (check headers)
2. For development, disable:
   DISABLE_RATE_LIMIT=true

3. Increase limits in config
```

### 5. External Service Issues

#### Silence Labs Connection
```
Error: MPC service unavailable

Solutions:
1. Check admin token:
   echo $SILENCE_ADMIN_TOKEN

2. Verify backend URL:
   curl $SILENCE_BACKEND_URL/health

3. Use mock for development:
   MOCK_MPC_SERVICE=true
```

#### Orby Integration
```
Error: Chain abstraction failed

Solutions:
1. Verify API key:
   curl -H "X-API-Key: $ORBY_API_KEY" $ORBY_API_URL

2. Check instance URL is correct
3. Use mock service for testing
```

#### Email Service
```
Error: Email delivery failed

Solutions:
1. Check SendGrid API key
2. Verify sender domain
3. For development, use console logger:
   EMAIL_PROVIDER=console
```

### 6. Docker Issues

#### Container Won't Start
```bash
# Check logs
docker-compose logs backend

# Rebuild image
docker-compose build --no-cache backend

# Reset everything
docker-compose down -v
docker-compose up --build
```

#### Volume Permissions
```bash
# Error: Permission denied

# Solution:
sudo chown -R $(whoami):$(whoami) ./data
# Or use named volumes instead
```

### 7. Testing Failures

#### Test Database Not Found
```bash
# Create test database
createdb interspace_test

# Or use Docker:
docker run -d \
  -p 5433:5432 \
  -e POSTGRES_DB=interspace_test \
  postgres:15
```

#### Flaky Tests
```javascript
// Common causes:
1. Async timing issues - use proper waits
2. Test data conflicts - use unique IDs
3. External dependencies - mock them

// Debug single test:
npm test -- --testNamePattern="should create profile"
```

### 8. Production Issues

#### Memory Leaks
```bash
# Monitor memory
npm run start:prod -- --inspect

# Common causes:
1. Event listener leaks
2. Unclosed database connections
3. Large arrays in memory

# Use heap snapshots:
node --inspect src/index.ts
```

#### High CPU Usage
```bash
# Profile CPU
npm run start:prod -- --prof

# Common causes:
1. Infinite loops
2. Synchronous crypto operations
3. Inefficient database queries
```

## Debugging Tools

### 1. Logger Debug Mode
```typescript
// Enable debug logs
LOG_LEVEL=debug npm run dev

// In code:
logger.debug('Detailed info', { data });
```

### 2. Database Query Logging
```typescript
// Enable Prisma query logs
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn']
});
```

### 3. HTTP Request Debugging
```bash
# Use HTTPie for testing
http POST localhost:3000/api/v1/auth/login \
  email=test@example.com

# Or curl with verbose
curl -v -X POST http://localhost:3000/api/v1/profiles
```

### 4. VS Code Debugging
```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Server",
  "program": "${workspaceFolder}/src/index.ts",
  "envFile": "${workspaceFolder}/.env.development"
}
```

## Performance Optimization

### Slow Queries
```sql
-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Add indexes where needed
CREATE INDEX idx_user_email ON users(email);
```

### API Response Times
```typescript
// Add timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} - ${duration}ms`);
  });
  next();
});
```

## Emergency Procedures

### 1. Rollback Deployment
```bash
# Quick rollback
gcloud run services update-traffic interspace-backend-prod \
  --to-revisions=PREVIOUS_REVISION=100

# Check previous revisions
gcloud run revisions list --service=interspace-backend-prod
```

### 2. Database Recovery
```bash
# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --restore-instance=interspace-db-prod

# Emergency connection
psql $PROD_DATABASE_URL
```

### 3. Clear All Caches
```bash
# Redis cache
redis-cli FLUSHALL

# Application cache
curl -X POST https://api.interspace.fi/admin/cache/clear
```

## Getting Help

### Internal Resources
1. Check `/docs` folder
2. Search closed GitHub issues
3. Ask in #engineering Slack

### External Resources
1. [Prisma Documentation](https://www.prisma.io/docs)
2. [Google Cloud Status](https://status.cloud.google.com)
3. [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging)

---

**Pro Tip**: Always check logs first. Most issues leave clear error messages.