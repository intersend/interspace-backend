# End-to-End Testing Suite

This comprehensive E2E test suite validates the complete user journey for Interspace wallet, including MPC wallet creation, Orby chain abstraction, and real testnet transactions.

## Architecture

The E2E tests use the actual interspace-duo-node proxy service running in Docker to communicate with Silence Labs for MPC operations. This ensures we test the real flow that production will use.

```
iOS App (simulated) → Duo Node (Docker) → Silence Labs Cloud → MPC Operations
                    ↓
                Backend API → Orby → Multi-chain Operations
```

## Prerequisites

1. **Docker**: Required to run interspace-duo-node and test databases
2. **interspace-duo-node**: Clone the duo node repository
   ```bash
   cd ../
   git clone <duo-node-repo-url> interspace-duo-node
   ```
3. **Environment Variables**: Copy and configure `.env.e2e.example`
   ```bash
   cp .env.e2e.example .env.e2e
   # Edit .env.e2e with your Silence Labs and Orby credentials
   ```

## Running E2E Tests

### Option 1: Full Docker Environment (Recommended)
```bash
# This starts all services and runs tests
npm run test:e2e:docker

# Or manually:
npm run docker:e2e:up      # Start services
npm run test:e2e:local     # Run tests
npm run docker:e2e:down    # Cleanup
```

### Option 2: Local Services
If you have PostgreSQL, Redis, and duo node running locally:
```bash
npm run test:e2e:local
```

## Test Coverage

### 1. User Registration & Authentication
- SIWE (Sign-In with Ethereum) registration
- JWT token generation
- Session management

### 2. MPC Wallet Creation
- Client keyshare generation (simulating iOS)
- Server keyshare via duo node → Silence Labs
- Session wallet deployment

### 3. Orby Integration
- Account cluster creation
- Virtual node initialization
- Cross-chain balance aggregation

### 4. Account Linking
- EOA account linking
- Orby cluster updates
- EIP-7702 delegation preparation

### 5. Testnet Funding
- Automatic funding via Circle faucet
- Balance verification
- Multi-token support (ETH, USDC, EURC)

### 6. Transaction Execution
- Simple transfers (ETH, USDC)
- Cross-chain operations
- Batch transactions
- Gas abstraction

### 7. Advanced Features
- MPC key backup and restore
- Key rotation (keeping same address)
- Error recovery
- Performance optimization

## Testnet Configuration

Primary testnet: **Ethereum Sepolia (11155111)**
- Most mature testnet
- Best faucet availability
- Wide tool support

Secondary testnets:
- Polygon Amoy (80002)
- Base Sepolia (84532)
- Arbitrum Sepolia (421614)

## Circle Faucet Integration

The tests automatically fund wallets using Circle's testnet faucet:
- API Key is included in `.env.e2e.example`
- Funds both native tokens and USDC
- Automatic retry on rate limits

## MPC Testing Architecture

```typescript
// Simulated iOS client behavior
const mpcClient = new MPCTestClient(duoNodeUrl);
const keyShare = await mpcClient.generateTestKeyShare(profileId);

// Real duo node communication
duoNode → Silence Labs → P2 keyshare generation
         ↓
    Store encrypted P2 share in database
```

## Debugging

### View Service Logs
```bash
# All services
npm run docker:e2e:logs

# Specific service
docker logs interspace-duo-node-e2e

# From test code
const logs = await testEnv.getDuoNodeLogs();
```

### Common Issues

1. **Duo Node Not Starting**
   - Check Silence Labs credentials in `.env.e2e`
   - Verify duo node Docker image builds successfully
   - Check port 3001 is available

2. **Testnet Funding Fails**
   - Circle faucet has rate limits (wait 1 minute)
   - Check wallet addresses are valid
   - Verify testnet RPC URLs are accessible

3. **MPC Operations Fail**
   - Ensure duo node is healthy: `curl http://localhost:3001/health`
   - Check Silence Labs connectivity
   - Verify Google Cloud credentials if using authenticated duo node

## Writing New Tests

```typescript
describe('New Feature', () => {
  it('should test new functionality', async () => {
    // 1. Setup test data
    const wallet = context.testWallets.get('primary');
    
    // 2. Generate MPC keyshare
    const keyShare = await context.mpcClient.generateTestKeyShare('profile_id');
    
    // 3. Make API calls
    const response = await api.post('/endpoint', data);
    
    // 4. Sign operations with MPC
    const signatures = await context.mpcClient.signOperations(
      'profile_id',
      operations
    );
    
    // 5. Verify results
    expect(response.status).toBe(200);
  });
});
```

## CI/CD Integration

For GitHub Actions or other CI systems:

```yaml
- name: Run E2E Tests
  env:
    SILENCE_NODE_URL: ${{ secrets.SILENCE_NODE_URL }}
    SILENCE_ADMIN_TOKEN: ${{ secrets.SILENCE_ADMIN_TOKEN }}
    ORBY_INSTANCE_PRIVATE_API_KEY: ${{ secrets.ORBY_API_KEY }}
  run: |
    npm run test:e2e:docker
```

## Performance Benchmarks

Expected test execution times:
- Full test suite: ~5-10 minutes
- User journey: ~2-3 minutes
- Transaction tests: ~30-60 seconds each
- Batch operations: ~1-2 minutes

## Security Notes

- Test wallets use well-known private keys (DO NOT use in production)
- Circle faucet API key is for testnet only
- Duo node should only be exposed on localhost for tests
- Always use separate database for E2E tests