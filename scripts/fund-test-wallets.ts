#!/usr/bin/env -S npx ts-node

import { ethers } from 'ethers';
import { circleFaucet } from '../tests/e2e/services/CircleFaucetService';
import { getTestnetByChainId } from '../tests/e2e/config/testnet.config';
import { config } from '../src/utils/config';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface FundingConfig {
  addresses: string[];
  chains: number[];
  amounts: {
    native: boolean;
    usdc: boolean;
    eurc: boolean;
  };
  minBalances: {
    native: string; // in ETH
    usdc: string;   // in USDC
  };
}

/**
 * Fund test wallets using Circle testnet faucet
 */
async function fundTestWallets(config: FundingConfig) {
  console.log('🚀 Starting wallet funding process...');
  console.log(`📍 Addresses to fund: ${config.addresses.length}`);
  console.log(`🔗 Chains: ${config.chains.map(c => getTestnetByChainId(c)?.name || c).join(', ')}`);
  console.log('');

  const results: Array<{
    address: string;
    chain: number;
    success: boolean;
    error?: string;
  }> = [];

  // Process each address and chain combination
  for (const address of config.addresses) {
    for (const chainId of config.chains) {
      console.log(`\n💳 Processing ${address} on chain ${chainId}...`);
      
      try {
        // Check if funding is needed
        const testnet = getTestnetByChainId(chainId);
        if (!testnet) {
          throw new Error(`Unknown chain ID: ${chainId}`);
        }

        const provider = new ethers.JsonRpcProvider(testnet.rpcUrl);
        
        // Check current balance
        const needsFunding = await circleFaucet.ensureMinimumBalance(
          address,
          chainId,
          config.minBalances.native,
          config.minBalances.usdc,
          provider
        );

        if (needsFunding) {
          console.log('✅ Wallet funded successfully');
          results.push({ address, chain: chainId, success: true });
        } else {
          console.log('✅ Wallet already has sufficient balance');
          results.push({ address, chain: chainId, success: true });
        }
      } catch (error: any) {
        console.error(`❌ Failed to fund ${address} on chain ${chainId}:`, error.message);
        results.push({ 
          address, 
          chain: chainId, 
          success: false, 
          error: error.message 
        });
      }
    }
  }

  // Summary
  console.log('\n📊 Funding Summary:');
  console.log('=====================================');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed funding attempts:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.address} on chain ${r.chain}: ${r.error}`);
    });
  }
  
  console.log('\n✨ Funding process complete!');
  return results;
}

/**
 * Main execution
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run fund-wallets -- [addresses...] [options]

Options:
  --chains <chain_ids>     Comma-separated chain IDs (default: 11155111,80002,84532,421614)
  --native                 Request native tokens (default: true)
  --usdc                   Request USDC tokens (default: true)
  --eurc                   Request EURC tokens (default: false)
  --min-native <amount>    Minimum native balance in ETH (default: 0.1)
  --min-usdc <amount>      Minimum USDC balance (default: 100)
  --env <key>              Use address from environment variable

Examples:
  npm run fund-wallets -- 0x123...abc 0x456...def
  npm run fund-wallets -- --env TEST_WALLET_ADDRESS --chains 11155111
  npm run fund-wallets -- 0x123...abc --chains 11155111,80002 --min-native 0.5
`);
    process.exit(0);
  }

  // Parse options
  const addresses: string[] = [];
  let chains = [11155111, 80002, 84532, 421614]; // Default chains
  let native = true;
  let usdc = true;
  let eurc = false;
  let minNative = '0.1';
  let minUsdc = '100';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('0x') && arg.length === 42) {
      addresses.push(arg);
    } else if (arg === '--chains' && i + 1 < args.length) {
      chains = args[++i].split(',').map(c => parseInt(c));
    } else if (arg === '--native') {
      native = args[++i] !== 'false';
    } else if (arg === '--usdc') {
      usdc = args[++i] !== 'false';
    } else if (arg === '--eurc') {
      eurc = args[++i] === 'true';
    } else if (arg === '--min-native' && i + 1 < args.length) {
      minNative = args[++i];
    } else if (arg === '--min-usdc' && i + 1 < args.length) {
      minUsdc = args[++i];
    } else if (arg === '--env' && i + 1 < args.length) {
      const envKey = args[++i];
      const envAddress = process.env[envKey];
      if (envAddress) {
        addresses.push(envAddress);
      } else {
        console.error(`❌ Environment variable ${envKey} not found`);
        process.exit(1);
      }
    }
  }

  // Validate addresses
  if (addresses.length === 0) {
    console.error('❌ No addresses provided');
    process.exit(1);
  }

  // Validate addresses format
  for (const address of addresses) {
    if (!ethers.isAddress(address)) {
      console.error(`❌ Invalid address: ${address}`);
      process.exit(1);
    }
  }

  // Execute funding
  const config: FundingConfig = {
    addresses,
    chains,
    amounts: { native, usdc, eurc },
    minBalances: { native: minNative, usdc: minUsdc }
  };

  try {
    await fundTestWallets(config);
    process.exit(0);
  } catch (error) {
    console.error('❌ Funding failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { fundTestWallets };