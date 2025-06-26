# Testnet Wallet Funding Script

This script uses the Circle testnet faucet to fund wallets with native tokens and USDC on various testnets.

## Usage

```bash
npm run fund-wallets -- [addresses...] [options]
```

## Options

- `--chains <chain_ids>` - Comma-separated chain IDs (default: 11155111,80002,84532,421614)
- `--native` - Request native tokens (default: true)
- `--usdc` - Request USDC tokens (default: true)
- `--eurc` - Request EURC tokens (default: false)
- `--min-native <amount>` - Minimum native balance in ETH (default: 0.1)
- `--min-usdc <amount>` - Minimum USDC balance (default: 100)
- `--env <key>` - Use address from environment variable

## Supported Chains

- **11155111** - Ethereum Sepolia
- **80002** - Polygon Amoy
- **84532** - Base Sepolia
- **421614** - Arbitrum Sepolia

## Examples

### Fund a single wallet on all default chains
```bash
npm run fund-wallets -- 0x742d35Cc6634C0532925a3b844Bc9e7595f62794
```

### Fund multiple wallets
```bash
npm run fund-wallets -- 0x123...abc 0x456...def
```

### Fund wallet from environment variable
```bash
npm run fund-wallets -- --env TEST_WALLET_ADDRESS
```

### Fund on specific chains only
```bash
npm run fund-wallets -- 0x123...abc --chains 11155111,80002
```

### Request higher minimum balances
```bash
npm run fund-wallets -- 0x123...abc --min-native 0.5 --min-usdc 500
```

### Request EURC tokens as well
```bash
npm run fund-wallets -- 0x123...abc --eurc true
```

## Features

- **Smart funding**: Only requests funds if wallet balance is below minimum
- **Multi-chain support**: Fund wallets on multiple chains in one command
- **Parallel processing**: Funds multiple wallets concurrently
- **Rate limit handling**: Automatically handles Circle API rate limits
- **Progress tracking**: Shows real-time status of funding operations

## Circle Faucet Limits

- **Rate limit**: 10 requests per minute per IP
- **Daily limit**: 100 requests per day per IP
- **Amounts per request**:
  - Native tokens: 0.5 ETH/MATIC/etc
  - USDC: 500 USDC
  - EURC: 500 EURC

## Environment Variables

The script uses the following environment variable if available:
- `CIRCLE_TESTNET_API_KEY` - Circle API key (optional, defaults to test key)

## Error Handling

The script will:
- Validate all addresses before making requests
- Skip wallets that already have sufficient balance
- Continue with other wallets if one fails
- Provide a summary of successful and failed funding attempts