# Real E2E Test Suite

This directory contains comprehensive end-to-end tests that run against real services including:
- **Interspace Duo Node** (MPC proxy to Silence Labs)
- **Orby API** (Chain abstraction)
- **Real blockchain networks** (Sepolia, Polygon, Arbitrum)
- **PostgreSQL and Redis** (Real instances)

## Test Suites

### 1. Real MPC Operations (`realMpcOperations.test.ts`)
Tests actual MPC key generation and signing through Duo Node:
- ✅ Real key generation with Silence Labs
- ✅ Message and transaction signing
- ✅ Batch signing performance
- ✅ Key rotation and backup
- ✅ Network interruption handling
- ✅ Integration with session wallet service

### 2. Real Orby Integration (`realOrbyOperations.test.ts`)
Tests Orby chain abstraction features:
- ✅ Account cluster creation
- ✅ Multi-chain virtual nodes
- ✅ Unified balance fetching
- ✅ Transfer and swap operations
- ✅ Cross-chain operations
- ✅ Gas abstraction with non-native tokens
- ✅ Operation monitoring
- ✅ Error handling and rate limiting

### 3. Real Batch Operations (`realBatchOperations.test.ts`)
Tests batch operation functionality:
- ✅ Batch creation and management
- ✅ Multi-operation batches
- ✅ MPC signing of batches
- ✅ Blockchain execution
- ✅ Cross-chain batches
- ✅ Gas optimization
- ✅ Approval workflows
- ✅ Error handling and rollback

### 4. Real Delegation Flow (`realDelegationFlow.test.ts`)
Tests EIP-7702 delegation features:
- ✅ Delegation authorization creation
- ✅ MPC signing of delegations
- ✅ On-chain activation
- ✅ Gas-free operations
- ✅ Multi-account management
- ✅ Permission enforcement
- ✅ Revocation and security
- ✅ Cross-chain delegation

### 5. Real User Journey (`realUserJourney.test.ts`)
Tests complete user workflows:
- ✅ New user onboarding
- ✅ Multi-chain power user setup
- ✅ DeFi user with advanced features
- ✅ Enterprise account management
- ✅ Team permissions and payroll
- ✅ Comprehensive analytics

## Setup

### 1. Configure Environment
Copy and configure the real E2E environment file:
```bash
cp .env.e2e.real.example .env.e2e.real
```

Required configurations:
- **Orby API Key**: Get from Orby testnet dashboard
- **Silence Labs Credentials**: Required for MPC operations
- **Blockchain RPC URLs**: Alchemy/Infura endpoints
- **Test wallet keys**: Funded test wallets

### 2. Start Services
```bash
# Start all required services
docker-compose -f docker-compose.e2e.yml up -d

# Or use profiles for specific setups
docker-compose -f docker-compose.e2e.yml --profile full-stack up -d
```

### 3. Run Tests

#### Run all tests:
```bash
./tests/e2e/real/run-real-e2e.sh
```

#### Run individual test suites:
```bash
# MPC Operations
npm test -- tests/e2e/real/realMpcOperations.test.ts

# Orby Integration
npm test -- tests/e2e/real/realOrbyOperations.test.ts

# Batch Operations
npm test -- tests/e2e/real/realBatchOperations.test.ts

# Delegation Flow
npm test -- tests/e2e/real/realDelegationFlow.test.ts

# User Journey
npm test -- tests/e2e/real/realUserJourney.test.ts
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Test Suite    │────▶│  Backend API     │────▶│   Duo Node      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                           │
                                ▼                           ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   Orby API       │     │ Silence Labs    │
                        └──────────────────┘     └─────────────────┘
                                │                           │
                                ▼                           ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   Blockchains    │     │  MPC Network    │
                        └──────────────────┘     └─────────────────┘
```

## Key Features Tested

### MPC Integration
- 2-of-2 threshold signatures with iOS + Server
- Key generation through Duo Node proxy
- Transaction signing and verification
- Batch signing optimization
- Key rotation and recovery

### Chain Abstraction (Orby)
- Multi-chain account clusters
- Unified balance across chains
- Gas abstraction (pay with any token)
- Cross-chain transfers and swaps
- Virtual node management

### Batch Operations
- Multi-operation batching
- Gas optimization
- Cross-chain batches
- Approval workflows
- Atomic execution

### EIP-7702 Delegation
- Account authorization
- Gas-free operations
- Permission management
- Multi-account delegation
- Security controls

## Troubleshooting

### Common Issues

1. **Duo Node Connection Failed**
   ```bash
   # Check if duo node is running
   docker ps | grep duo-node
   
   # Check logs
   docker logs interspace-duo-node-e2e
   ```

2. **Orby API Errors**
   - Verify API key in `.env.e2e.real`
   - Check rate limits
   - Ensure testnet access

3. **MPC Signing Failures**
   - Verify Silence Labs credentials
   - Check network connectivity
   - Ensure key shares are properly stored

4. **Database Errors**
   ```bash
   # Reset test database
   docker-compose -f docker-compose.e2e.yml down -v
   docker-compose -f docker-compose.e2e.yml up -d
   npm run prisma:push:test
   ```

## Performance Benchmarks

Expected performance for key operations:
- MPC Key Generation: ~5-10 seconds
- MPC Signing: ~2-5 seconds
- Batch Signing (5 ops): ~10-15 seconds
- Orby Operation Build: ~1-3 seconds
- Cross-chain Transfer: ~5-10 seconds

## Contributing

When adding new tests:
1. Follow the existing test structure
2. Use real services (no mocks)
3. Handle errors gracefully
4. Add proper logging
5. Update this README

## Security Notes

- Never commit real private keys
- Use testnet endpoints only
- Rotate test credentials regularly
- Monitor for exposed secrets