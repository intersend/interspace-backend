# Interspace Backend - Testing Guide

Comprehensive guide for testing the Interspace Backend locally and preparing for deployment.

## 📋 Table of Contents

1. [Testing Overview](#testing-overview)
2. [Test Environment Setup](#test-environment-setup)
3. [Running Tests](#running-tests)
4. [Test Scripts](#test-scripts)
5. [Manual Testing](#manual-testing)
6. [Performance Testing](#performance-testing)
7. [Security Testing](#security-testing)
8. [CI/CD Testing](#cicd-testing)

## 🎯 Testing Overview

### Test Categories

1. **Unit Tests**: Test individual functions and components
2. **Integration Tests**: Test component interactions
3. **E2E Tests**: Test complete user flows
4. **Performance Tests**: Test load and stress handling
5. **Security Tests**: Test authentication and authorization
6. **Deployment Tests**: Validate deployment readiness

### Testing Stack

- **Jest**: Unit and integration testing
- **Supertest**: API endpoint testing
- **Custom Scripts**: Specialized testing scenarios
- **Docker**: Container and environment testing

## 🔧 Test Environment Setup

### 1. Basic Setup

```bash
# Ensure test database exists
docker exec interspace-postgres psql -U postgres -c "CREATE DATABASE interspace_test;"

# Set test environment
export NODE_ENV=test

# Or use test-specific env file
cp .env.test .env
```

### 2. Test Environment Variables

Create `.env.test`:
```env
NODE_ENV=test
PORT=3333
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/interspace_test"
JWT_SECRET=test-jwt-secret
JWT_REFRESH_SECRET=test-jwt-refresh-secret
ENCRYPTION_SECRET=test-encryption-key
DISABLE_MPC=true
BYPASS_LOGIN=true
LOG_LEVEL=error
```

### 3. Isolated Test Database

```bash
# Reset test database before tests
npm run prisma:test:reset

# Apply migrations to test database
npm run prisma:test:migrate
```

## 🚀 Running Tests

### All Tests

```bash
# Run complete test suite
npm test

# With coverage
npm run test:coverage

# In watch mode
npm run test:watch

# CI mode
npm run test:ci
```

### Specific Test Types

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# E2E tests only
npm run test:e2e
```

### Individual Test Files

```bash
# Run specific test file
npm test -- auth.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should authenticate"
```

## 📜 Test Scripts

### 1. Deployment Test Suite

```bash
# Comprehensive deployment validation
./scripts/test-deployment.sh
```

This runs:
- Prerequisites check
- Environment validation
- Smoke tests
- Health endpoint tests
- Authentication tests
- Database tests
- Docker tests
- npm test suite

### 2. Health Endpoint Tests

```bash
./scripts/test-health-endpoints.sh
```

Tests:
- `/health` - Basic health
- `/health/detailed` - Detailed status
- `/health/database` - Database connectivity
- `/health/mpc` - MPC service status
- Response time performance
- Concurrent request handling

### 3. Authentication Flow Tests

```bash
./scripts/test-auth-flow.sh
```

Tests:
- Login with various strategies
- Token generation
- Token refresh
- Token validation
- Logout flow
- Rate limiting

### 4. Database Operation Tests

```bash
./scripts/test-database-operations.sh
```

Tests:
- Connection pooling
- Migration status
- Query performance
- Transaction handling
- Concurrent connections

### 5. Docker Build Tests

```bash
./scripts/test-docker-build.sh
```

Tests:
- Dockerfile syntax
- Image building
- Container runtime
- Health checks in container
- Security scanning

### 6. Load Tests

```bash
./scripts/load-test.sh
```

Tests:
- Concurrent user simulation
- Request throughput
- Response time distribution
- Stress testing
- Performance metrics

## 🔍 Manual Testing

### API Testing with cURL

#### 1. Health Check
```bash
curl http://localhost:3000/health | jq
```

#### 2. Authentication
```bash
# Authenticate
curl -X POST http://localhost:3000/api/v1/auth/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "authStrategy": "test",
    "deviceId": "manual-test-001",
    "deviceName": "Manual Test",
    "deviceType": "test"
  }' | jq

# Save token
TOKEN=$(curl -X POST ... | jq -r '.accessToken')
```

#### 3. Authenticated Requests
```bash
# Get profiles
curl http://localhost:3000/api/v1/profiles \
  -H "Authorization: Bearer $TOKEN" | jq

# Create profile
curl -X POST http://localhost:3000/api/v1/profiles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Profile"}' | jq
```

### Using Postman

1. Import the API collection from `AI_API_REFERENCE.yaml`
2. Set environment variables:
   - `base_url`: `http://localhost:3000`
   - `api_version`: `v1`
   - `token`: Your JWT token
3. Run collection tests

### Database Inspection

```bash
# Connect to database
docker exec -it interspace-postgres psql -U postgres -d interspace

# Useful queries
\dt                          # List tables
\d+ users                    # Describe users table
SELECT COUNT(*) FROM users;  # Count users
SELECT * FROM users LIMIT 5; # View users
```

## ⚡ Performance Testing

### Basic Load Test

```bash
# Run standard load test
./scripts/load-test.sh
```

### Advanced Load Testing with Apache Bench

```bash
# Install ab (Apache Bench)
# macOS: comes with Apache
# Linux: apt-get install apache2-utils

# Simple load test
ab -n 1000 -c 10 http://localhost:3000/health

# With authentication
ab -n 100 -c 5 -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/profiles
```

### Performance Metrics to Monitor

1. **Response Times**
   - Average: < 100ms
   - 95th percentile: < 200ms
   - 99th percentile: < 500ms

2. **Throughput**
   - Requests per second: > 100
   - Concurrent users: > 50

3. **Resource Usage**
   - CPU: < 80%
   - Memory: < 1GB
   - Database connections: < 50

## 🔒 Security Testing

### 1. Authentication Tests

```bash
# Test invalid tokens
curl http://localhost:3000/api/v1/profiles \
  -H "Authorization: Bearer invalid-token"

# Test expired tokens
# Test SQL injection
# Test XSS attempts
```

### 2. Rate Limiting Tests

```bash
# Rapid requests to trigger rate limit
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/v1/auth/authenticate \
    -H "Content-Type: application/json" \
    -d '{"authStrategy":"test"}' &
done
```

### 3. CORS Tests

```bash
# Test CORS headers
curl -I -X OPTIONS http://localhost:3000/api/v1 \
  -H "Origin: http://evil.com" \
  -H "Access-Control-Request-Method: GET"
```

## 🔄 CI/CD Testing

### GitHub Actions Test

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
```

### Pre-deployment Checklist

```bash
# Run all checks
./scripts/test-deployment.sh

# Verify results
cat test-report-*.txt
```

## 📊 Test Reports

### Generate Coverage Report

```bash
# Generate HTML coverage report
npm run test:coverage

# Open report
open coverage/lcov-report/index.html
```

### Test Metrics

Track these metrics:
- Test coverage: > 80%
- Test execution time: < 5 minutes
- Flaky test rate: < 1%
- Test failure rate: < 5%

## 🐛 Debugging Failed Tests

### 1. Verbose Output

```bash
# Run with verbose logging
npm test -- --verbose

# Debug specific test
node --inspect-brk node_modules/.bin/jest --runInBand
```

### 2. Test Isolation

```bash
# Run single test
npm test -- --testNamePattern="specific test name"

# Run in band (no parallel)
npm test -- --runInBand
```

### 3. Database State

```bash
# Check test database
docker exec -it interspace-postgres psql -U postgres -d interspace_test

# Reset if needed
npm run prisma:test:reset
```

## 📝 Writing New Tests

### Unit Test Template

```typescript
describe('ComponentName', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something', async () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = await functionToTest(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Integration Test Template

```typescript
describe('API Endpoint', () => {
  let app: Application;
  let token: string;

  beforeAll(async () => {
    app = await createApp();
    token = await getTestToken();
  });

  it('should return data', async () => {
    const response = await request(app)
      .get('/api/v1/endpoint')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
  });
});
```

## 🚨 Common Test Issues

### Issue: Tests Failing Randomly
- Check for race conditions
- Ensure proper async/await usage
- Verify test isolation
- Check database state between tests

### Issue: Slow Tests
- Use test database
- Mock external services
- Parallelize where possible
- Profile test execution

### Issue: Environment Differences
- Use consistent Node version
- Lock dependencies
- Use Docker for consistency
- Document system requirements

---

Remember: Good tests are:
- **Fast**: Run quickly
- **Isolated**: Don't depend on other tests
- **Repeatable**: Same result every time
- **Self-checking**: Clear pass/fail
- **Timely**: Written with the code

Happy testing! 🧪