import { ethers } from 'ethers';

export interface TestnetConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  tokens: {
    USDC?: string;
    WETH?: string;
    USDT?: string;
    EURC?: string;
  };
  contracts?: {
    multicall?: string;
  };
  faucets: {
    native?: string;
    circle?: string;
  };
}

export const TESTNET_CONFIGS: Record<string, TestnetConfig> = {
  sepolia: {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    blockExplorer: 'https://sepolia.etherscan.io',
    nativeCurrency: {
      name: 'Sepolia ETH',
      symbol: 'ETH',
      decimals: 18
    },
    tokens: {
      // Circle's official USDC on Sepolia
      USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      // Wrapped ETH on Sepolia
      WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      // Test USDT
      USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
      // Circle's EURC on Sepolia
      EURC: '0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4'
    },
    contracts: {
      multicall: '0xcA11bde05977b3631167028862bE2a173976CA11'
    },
    faucets: {
      native: 'https://sepoliafaucet.com',
      circle: 'https://faucet.circle.com'
    }
  },
  
  'polygon-amoy': {
    chainId: 80002,
    name: 'Polygon Amoy',
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
    blockExplorer: 'https://amoy.polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18
    },
    tokens: {
      // Circle's USDC on Polygon Amoy
      USDC: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
      // Wrapped MATIC
      WETH: '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9'
    },
    faucets: {
      native: 'https://faucet.polygon.technology',
      circle: 'https://faucet.circle.com'
    }
  },

  'base-sepolia': {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.basescan.org',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18
    },
    tokens: {
      // Circle's USDC on Base Sepolia
      USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      WETH: '0x4200000000000000000000000000000000000006'
    },
    faucets: {
      native: 'https://www.coinbase.com/faucets/base-ethereum-goerli-faucet',
      circle: 'https://faucet.circle.com'
    }
  },

  'arbitrum-sepolia': {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
    blockExplorer: 'https://sepolia.arbiscan.io',
    nativeCurrency: {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18
    },
    tokens: {
      // Test tokens on Arbitrum Sepolia
      USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      WETH: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73'
    },
    faucets: {
      native: 'https://sepolia-faucet.arbitrum.io',
      circle: 'https://faucet.circle.com'
    }
  }
};

// Helper to get provider for a testnet
export function getTestnetProvider(network: keyof typeof TESTNET_CONFIGS): ethers.JsonRpcProvider {
  const config = TESTNET_CONFIGS[network];
  if (!config) {
    throw new Error(`Unknown testnet: ${network}`);
  }
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

// Helper to get all supported chain IDs
export function getSupportedChainIds(): number[] {
  return Object.values(TESTNET_CONFIGS).map(config => config.chainId);
}

// Helper to get testnet by chain ID
export function getTestnetByChainId(chainId: number): TestnetConfig | undefined {
  return Object.values(TESTNET_CONFIGS).find(config => config.chainId === chainId);
}

// Default test wallets (for development only - will be funded via faucet)
export const TEST_WALLETS = {
  primary: {
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fA66',
    // This is a well-known test private key - DO NOT USE IN PRODUCTION
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'
  },
  secondary: {
    address: '0xBe5C3e1E9b563D0c35529F73eB8b24D3d7E78e88',
    privateKey: '0xdbda1821b80551c9d65939329250298aa5d14f6e4873dd6e2a9c7a5f1e1a5c35'
  },
  recipient: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
  }
};

// Test amounts in wei
export const TEST_AMOUNTS = {
  // Small amounts for testing
  SMALL_ETH: ethers.parseEther('0.001'),
  MEDIUM_ETH: ethers.parseEther('0.01'),
  LARGE_ETH: ethers.parseEther('0.1'),
  
  // USDC amounts (6 decimals)
  SMALL_USDC: ethers.parseUnits('1', 6),    // 1 USDC
  MEDIUM_USDC: ethers.parseUnits('10', 6),  // 10 USDC
  LARGE_USDC: ethers.parseUnits('100', 6)   // 100 USDC
};

// Gas limits for different operations
export const GAS_LIMITS = {
  TRANSFER: 21000n,
  ERC20_TRANSFER: 65000n,
  SWAP: 200000n,
  DELEGATION: 100000n,
  BATCH_OPERATION: 500000n
};

// Timeout configurations
export const TIMEOUTS = {
  TRANSACTION: 60000,     // 1 minute
  FUNDING: 120000,        // 2 minutes
  CROSS_CHAIN: 300000,    // 5 minutes
  BLOCK_CONFIRMATION: 15000 // 15 seconds
};