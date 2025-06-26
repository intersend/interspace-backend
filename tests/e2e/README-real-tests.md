# Real E2E Testing Guide

This guide explains how to run end-to-end tests with real services including Silence Labs MPC, Orby chain abstraction, and Circle testnet faucets.

## Prerequisites

1. **Docker and Docker Compose** - Required for running local services
2. **API Keys** - You'll need:
   - Orby API key (get from https://orby.network)
   - Circle API key (optional, default test key included)
3. **Node.js 18+** and npm

## Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp tests/e2e/config/.env.real.example .env.e2e

# Edit .env.e2e and add your API keys
nano .env.e2e

# Run setup script
./scripts/setup-real-e2e.sh
```

### 2. Fund Test Wallets (Optional)

```bash
# Fund default test wallets
npm run fund-wallets -- --env TEST_WALLET_ADDRESS --env TEST_WALLET_2_ADDRESS

# Or fund specific addresses
npm run fund-wallets -- 0x742d35Cc6634C0532925a3b844Bc9e7595f62794
```

### 3. Run Tests

```bash
# Run all real tests
./scripts/run-real-tests.sh

# Run specific test suites
./scripts/run-real-tests.sh --mpc      # MPC tests only
./scripts/run-real-tests.sh --orby     # Orby tests only
./scripts/run-real-tests.sh --journey  # User journey tests
./scripts/run-real-tests.sh --transfers # Token transfer tests
./scripts/run-real-tests.sh --defi     # DeFi operations tests

# Run with options
./scripts/run-real-tests.sh --verbose  # Show detailed output
./scripts/run-real-tests.sh --bail     # Stop on first failure
```

## Test Suites

### 1. MPC Tests (`realMpcOperations.test.ts`)
Tests real Silence Labs MPC integration:
- Key generation with P1/P2 coordination
- Signature generation and verification
- Key rotation and refresh
- Multi-party computation via WebSocket

### 2. Orby Tests (`realOrbyOperations.test.ts`)
Tests real Orby chain abstraction:
- Account cluster creation
- Virtual node management
- Unified balance fetching
- Cross-chain transfers
- Gas abstraction
- Swap operations

### 3. User Journey Tests (`realUserJourney.test.ts`)
Complete end-to-end user flows:
- New user onboarding
- MPC wallet creation
- First transaction
- Multi-chain setup
- DeFi operations
- Enterprise features

### 4. Transfer Tests
Real token transfers on testnets:
- Native token transfers
- ERC20 token transfers
- Cross-chain bridging
- Batch transfers

### 5. DeFi Tests
Complex DeFi operations:
- Token swaps
- Liquidity provision
- Batch operations
- Account delegation
- Gas abstraction

## Service Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Test Suite    │────▶│   Backend API   │────▶│   Duo Node      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                         │
                                │                         ▼
                                │                 ┌─────────────────┐
                                │                 │  Sigpair (MPC)  │
                                │                 └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │   Orby API      │
                        └─────────────────┘
```

## Monitoring Tests

### View Logs
```bash
# All services
docker-compose -f docker-compose.e2e.yml logs -f

# Specific service
docker logs -f interspace-duo-node-e2e
docker logs -f interspace-sigpair-e2e
```

### Check Service Health
```bash
# Duo Node health
curl http://localhost:3002/health

# Backend health
curl http://localhost:3001/health

# Database status
docker exec interspace-postgres-e2e pg_isready -U postgres
```

## Troubleshooting

### Common Issues

1. **Services not starting**
   ```bash
   # Reset everything
   docker-compose -f docker-compose.e2e.yml down -v
   ./scripts/setup-real-e2e.sh
   ```

2. **Database connection errors**
   ```bash
   # Check if migrations ran
   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/interspace_e2e" npm run prisma:deploy
   ```

3. **MPC tests failing**
   - Ensure duo-node is healthy: `curl http://localhost:3002/health`
   - Check WebSocket connectivity
   - Verify sigpair is running: `docker ps | grep sigpair`

4. **Orby tests failing**
   - Verify API key is set in .env.e2e
   - Check network connectivity to api.testnet.orby.network
   - Ensure test wallet has balance

5. **Insufficient balance errors**
   - Run funding script: `npm run fund-wallets -- <address>`
   - Check balance: `npm run test:check-balances`

### Debug Mode

```bash
# Run with full logging
LOG_LEVEL=debug E2E_REAL_MODE=true npm run test:e2e -- --verbose

# Run single test with debugging
NODE_OPTIONS="--inspect" npm run test:e2e -- --testNamePattern="specific test name"
```

## Cleanup

```bash
# Stop all services
docker-compose -f docker-compose.e2e.yml down

# Remove all data (full reset)
docker-compose -f docker-compose.e2e.yml down -v
```

## CI/CD Integration

For CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Setup E2E Environment
  run: |
    cp tests/e2e/config/.env.real.example .env.e2e
    ./scripts/setup-real-e2e.sh
  env:
    ORBY_API_KEY: ${{ secrets.ORBY_API_KEY }}

- name: Run E2E Tests
  run: ./scripts/run-real-tests.sh --bail
```

## Best Practices

1. **API Keys**: Never commit real API keys. Use environment variables.
2. **Test Isolation**: Each test should clean up after itself.
3. **Wallet Funding**: Check balances before tests to avoid failures.
4. **Error Handling**: Tests should handle network timeouts gracefully.
5. **Parallel Execution**: Use `--runInBand` for predictable results.

## Advanced Configuration

### Custom Test Wallets

Add to `.env.e2e`:
```env
TEST_WALLET_PRIVATE_KEY=0x...
TEST_WALLET_2_PRIVATE_KEY=0x...
```

### Custom RPC Endpoints

Override default testnet RPCs:
```env
SEPOLIA_RPC_URL=https://your-rpc-endpoint
POLYGON_AMOY_RPC_URL=https://your-rpc-endpoint
```

### Timeout Configuration

Adjust timeouts for slow networks:
```env
REQUEST_TIMEOUT_MS=60000
MPC_OPERATION_TIMEOUT=120000
```

## Support

- Check logs: `docker-compose -f docker-compose.e2e.yml logs`
- Review test output with `--verbose` flag
- Ensure all services are healthy before running tests
- Fund test wallets if balance-related tests fail