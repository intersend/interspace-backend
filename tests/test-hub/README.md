# 🚀 Interspace API Test Hub

Military-grade testing infrastructure for comprehensive API endpoint validation with real-world condition simulation.

## Overview

The Test Hub provides a centralized, scalable testing framework that ensures every API endpoint is thoroughly validated before release. It simulates real-world conditions including JWT authentication, multi-user scenarios, rate limiting, and security vulnerabilities.

## Features

- **Comprehensive Coverage**: Tests all API endpoints with real authentication flows
- **Military-Grade Reporting**: Detailed HTML, JSON, JUnit, and PDF reports
- **Real-World Simulation**: JWT auth, 2FA, rate limiting, concurrent users
- **Flexible Execution**: Run all tests or target specific suites/endpoints
- **Performance Metrics**: Response times, throughput, percentiles
- **Security Auditing**: OWASP compliance, vulnerability detection
- **CI/CD Ready**: Integration with GitHub Actions, Jenkins, etc.

## Quick Start

```bash
# Install dependencies
npm install

# Run quick tests (critical only, ~2 minutes)
npm run test:hub:quick

# Run standard tests (~15 minutes)
npm run test:hub:standard

# Run comprehensive tests (including performance, ~45 minutes)
npm run test:hub:comprehensive

# List available test suites
npm run test:hub:list

# Get help
npm run test:hub:help
```

## Test Organization

```
test-hub/
├── core/               # Core framework components
│   ├── TestRunner.ts   # Main test orchestrator
│   ├── TestContext.ts  # Shared test context/state
│   └── TestReporter.ts # Reporting engine
├── suites/            # Test suites by domain
│   ├── auth/          # Authentication tests
│   │   ├── authenticationSuite.ts     # V1 authentication
│   │   └── authenticationV2Suite.ts   # V2 flat identity auth (NEW)
│   ├── identity/      # Identity management (NEW)
│   │   └── accountLinkingSuite.ts     # Account linking & privacy
│   ├── profiles/      # Profile management
│   │   └── profileManagementV2Suite.ts # V2 automatic profiles (NEW)
│   ├── sessions/      # Session management (NEW)
│   │   └── sessionManagementSuite.ts  # V2 sessions & tokens
│   ├── security/      # Security tests
│   │   ├── securitySuite.ts           # V1 security
│   │   └── flatIdentitySecuritySuite.ts # V2 security (NEW)
│   ├── apps/          # App management tests
│   ├── users/         # User management tests
│   └── performance/   # Performance tests
├── utils/             # Testing utilities
│   ├── ApiClient.ts   # Enhanced HTTP client
│   ├── AuthHelper.ts  # V1 Authentication helpers
│   ├── AuthHelperV2.ts # V2 Flat identity helpers (NEW)
│   ├── TestWallet.ts  # SIWE wallet testing utilities (NEW)
│   └── logger.ts      # Logging utilities
└── reports/           # Generated test reports
```

## Execution Modes

### Quick Mode
- Runs critical path tests only
- ~2 minutes execution time
- Ideal for pre-commit hooks

```bash
npm run test:hub:quick
```

### Standard Mode
- Full functional test coverage
- ~15 minutes execution time
- Recommended for CI/CD pipelines

```bash
npm run test:hub:standard
```

### Comprehensive Mode
- All tests including performance and security
- ~45 minutes execution time
- Used before major releases

```bash
npm run test:hub:comprehensive
```

## Selective Testing

### By Suite
```bash
# Test specific suites
npm run test:hub -- --suites Authentication Users

# Test authentication only
npm run test:hub:auth
```

### By Tags
```bash
# Test by tags
npm run test:hub -- --tags critical security

# Security tests only
npm run test:hub:security
```

### By Endpoints
```bash
# Test specific endpoint patterns
npm run test:hub -- --endpoints "/api/v1/auth/*" "/api/v1/users/*"
```

## Real-World Testing Examples

### Complete Authentication Flow
```typescript
// Simulates real user authentication journey
const user = await context.createUser({
  email: 'test@example.com',
  password: 'SecurePassword123!'
});

// Authenticate and get tokens
const { accessToken, refreshToken } = await authHelper.authenticate(user);

// Use authenticated client for subsequent requests
const client = context.createApiClient(accessToken);
const profile = await client.post('/api/v1/profiles', { name: 'Test Profile' });

// Test token refresh
const newTokens = await authHelper.refreshToken(refreshToken);

// Test logout
await authHelper.logout(client);
```

### Multi-User Scenarios
```typescript
// Create multiple users
const users = await Promise.all([
  context.createUser(),
  context.createUser(),
  context.createUser()
]);

// Simulate concurrent operations
const results = await Promise.all(
  users.map(user => performUserActions(user))
);
```

### Security Testing
```typescript
// SQL Injection attempts
await securityHelper.testSQLInjection(client);

// XSS Prevention
await securityHelper.testXSSPrevention(client);

// Rate Limiting
await securityHelper.testRateLimiting(client);

// Token Security
await securityHelper.testTokenManipulation(client);
```

## V2 Flat Identity Testing (NEW)

The test hub now includes comprehensive testing for the V2 flat identity architecture:

### Test V2 Authentication
```bash
# Run all V2 tests
npm run test:hub -- --tags v2

# Test wallet authentication with SIWE
npm run test:hub -- --suites "Authentication V2"

# Test account linking
npm run test:hub -- --suites "Account Linking"
```

### SIWE Wallet Testing
```typescript
// Create test wallet
const wallet = new TestWallet(0);

// Generate SIWE authentication
const authPayload = await wallet.generateAuthPayload({ 
  nonce: 'server-nonce',
  domain: 'localhost:3000' 
});

// Authenticate with wallet
const response = await client.post('/api/v2/auth/authenticate', {
  strategy: 'wallet',
  ...authPayload
});
```

### Account Linking
```typescript
// Link multiple accounts
const authHelper = new AuthHelperV2(context);

// Primary authentication
const primaryAuth = await authHelper.authenticateWithWallet(client, 0);
client.setAccessToken(primaryAuth.tokens.accessToken);

// Link email account
await authHelper.linkAccounts(client, 'email', 'user@example.com');

// Link with privacy mode
await authHelper.linkAccounts(client, 'wallet', walletAddress, {
  privacyMode: 'partial'
});

// Get identity graph
const graph = await authHelper.getIdentityGraph(client);
```

### Privacy Modes Testing
```typescript
// Test different privacy modes
const privacyModes = ['linked', 'partial', 'isolated'];

for (const mode of privacyModes) {
  const auth = await authHelper.authenticateWithWallet(client, index, {
    privacyMode: mode
  });
  
  // Verify privacy boundaries
  const profiles = await client.get('/api/v1/profiles');
  // Isolated mode shows only own profiles
  // Linked mode shows all connected profiles
}
```

### V2 Test Suites
- **authenticationV2Suite**: SIWE wallet auth, automatic profile creation
- **accountLinkingSuite**: Identity graph, privacy modes, linking/unlinking
- **profileManagementV2Suite**: Automatic profiles, cross-account access
- **sessionManagementSuite**: Account-based sessions, token management
- **flatIdentitySecuritySuite**: Privacy enforcement, attack prevention

## Reports

### HTML Report
Interactive dashboard with:
- Summary statistics
- Performance metrics
- Security findings
- Test details
- Recommendations

### JSON Report
Machine-readable format for:
- CI/CD integration
- Custom analysis
- Trend tracking

### JUnit XML
Compatible with:
- Jenkins
- GitHub Actions
- Most CI tools

## Configuration

### Environment Variables
```env
# Test environment
TEST_API_URL=http://localhost:3000
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/test_db

# Reporting
TEST_REPORT_DIR=./reports
TEST_SLACK_WEBHOOK=https://hooks.slack.com/...
TEST_EMAIL_RECIPIENTS=team@example.com

# Performance
TEST_MAX_CONCURRENCY=10
TEST_TIMEOUT=30000
```

### Custom Test Configuration
```typescript
const options: TestOptions = {
  mode: 'standard',
  parallel: true,
  maxConcurrency: 5,
  bail: false,
  timeout: 30000,
  retries: 1,
  reporter: {
    formats: ['html', 'json', 'junit'],
    includeScreenshots: true,
    includeRequestLogs: true,
    slackWebhook: process.env.TEST_SLACK_WEBHOOK
  }
};
```

## Writing New Tests

### Test Suite Structure
```typescript
export const mySuite: TestSuite = {
  name: 'My Test Suite',
  tags: ['feature', 'critical'],
  priority: 'high',
  endpoints: ['/api/v1/my-endpoint/*'],
  
  async setup(context: TestContext) {
    // Setup test data
  },
  
  async teardown(context: TestContext) {
    // Cleanup
  },
  
  tests: [
    {
      name: 'My test case',
      async fn(context: TestContext) {
        const client = context.createApiClient();
        const response = await client.get('/api/v1/my-endpoint');
        assertResponse(response, 200);
      }
    }
  ]
};
```

### Best Practices
1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Assertions**: Use clear, specific assertions
4. **Naming**: Descriptive test names
5. **Tags**: Appropriate tagging for filtering

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run API Tests
  run: npm run test:hub:standard
  
- name: Upload Test Reports
  uses: actions/upload-artifact@v3
  with:
    name: test-reports
    path: tests/test-hub/reports/generated/
```

### Pre-commit Hook
```bash
#!/bin/sh
npm run test:hub:quick || {
  echo "Tests failed. Commit aborted."
  exit 1
}
```

### Pre-release Pipeline
```bash
# Full comprehensive testing before release
npm run test:hub:comprehensive

# Check exit code
if [ $? -ne 0 ]; then
  echo "Release blocked: Tests failed"
  exit 1
fi
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Ensure test database is running
   - Check DATABASE_URL in .env.test

2. **Port Already in Use**
   - Stop any running dev servers
   - Check TEST_API_URL configuration

3. **Rate Limiting in Tests**
   - Increase rate limits for test environment
   - Use TEST_RATE_LIMIT_MULTIPLIER env var

4. **Flaky Tests**
   - Increase timeouts for slow operations
   - Add retries for network-dependent tests
   - Ensure proper test isolation

## Performance Benchmarks

Expected performance metrics:
- Authentication: < 200ms
- Simple GET: < 50ms
- Complex POST: < 500ms
- Database queries: < 100ms
- Rate limit check: < 10ms

## Security Compliance

The test hub validates:
- OWASP Top 10
- JWT security best practices
- Rate limiting enforcement
- Input validation
- SQL injection prevention
- XSS protection
- CSRF protection

## Contributing

1. Add test suites in `suites/` directory
2. Follow existing patterns
3. Include appropriate tags
4. Update documentation
5. Ensure all tests pass

## License

MIT