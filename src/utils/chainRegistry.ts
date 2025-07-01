/**
 * Comprehensive EVM chain registry
 * Chain IDs and names from multiple sources including chainlist.org
 */

export interface ChainInfo {
  id: number;
  name: string;
  shortName: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  testnet?: boolean;
}

// Comprehensive chain registry supporting all major EVM chains
export const CHAIN_REGISTRY: Record<number, ChainInfo> = {
  // Mainnets
  1: {
    id: 1,
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  10: {
    id: 10,
    name: 'Optimism',
    shortName: 'Optimism',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  25: {
    id: 25,
    name: 'Cronos Mainnet',
    shortName: 'Cronos',
    nativeCurrency: { name: 'Cronos', symbol: 'CRO', decimals: 18 }
  },
  56: {
    id: 56,
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }
  },
  100: {
    id: 100,
    name: 'Gnosis',
    shortName: 'Gnosis',
    nativeCurrency: { name: 'xDAI', symbol: 'xDAI', decimals: 18 }
  },
  137: {
    id: 137,
    name: 'Polygon',
    shortName: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }
  },
  250: {
    id: 250,
    name: 'Fantom Opera',
    shortName: 'Fantom',
    nativeCurrency: { name: 'Fantom', symbol: 'FTM', decimals: 18 }
  },
  324: {
    id: 324,
    name: 'zkSync Era Mainnet',
    shortName: 'zkSync',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  1088: {
    id: 1088,
    name: 'Metis Andromeda Mainnet',
    shortName: 'Metis',
    nativeCurrency: { name: 'Metis', symbol: 'METIS', decimals: 18 }
  },
  1101: {
    id: 1101,
    name: 'Polygon zkEVM',
    shortName: 'zkEVM',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  1284: {
    id: 1284,
    name: 'Moonbeam',
    shortName: 'Moonbeam',
    nativeCurrency: { name: 'Glimmer', symbol: 'GLMR', decimals: 18 }
  },
  1285: {
    id: 1285,
    name: 'Moonriver',
    shortName: 'Moonriver',
    nativeCurrency: { name: 'Moonriver', symbol: 'MOVR', decimals: 18 }
  },
  8453: {
    id: 8453,
    name: 'Base',
    shortName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  42161: {
    id: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  42220: {
    id: 42220,
    name: 'Celo',
    shortName: 'Celo',
    nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 }
  },
  43114: {
    id: 43114,
    name: 'Avalanche C-Chain',
    shortName: 'Avalanche',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 }
  },
  59144: {
    id: 59144,
    name: 'Linea',
    shortName: 'Linea',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  534352: {
    id: 534352,
    name: 'Scroll',
    shortName: 'Scroll',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  7777777: {
    id: 7777777,
    name: 'Zora',
    shortName: 'Zora',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },

  // Layer 2s and Sidechains
  42170: {
    id: 42170,
    name: 'Arbitrum Nova',
    shortName: 'Nova',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  1313161554: {
    id: 1313161554,
    name: 'Aurora Mainnet',
    shortName: 'Aurora',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  2222: {
    id: 2222,
    name: 'Kava EVM',
    shortName: 'Kava',
    nativeCurrency: { name: 'Kava', symbol: 'KAVA', decimals: 18 }
  },
  288: {
    id: 288,
    name: 'Boba Network',
    shortName: 'Boba',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
  },
  1666600000: {
    id: 1666600000,
    name: 'Harmony Mainnet Shard 0',
    shortName: 'Harmony',
    nativeCurrency: { name: 'ONE', symbol: 'ONE', decimals: 18 }
  },

  // Testnets
  5: {
    id: 5,
    name: 'Goerli',
    shortName: 'Goerli',
    nativeCurrency: { name: 'Goerli Ether', symbol: 'ETH', decimals: 18 },
    testnet: true
  },
  11155111: {
    id: 11155111,
    name: 'Sepolia',
    shortName: 'Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    testnet: true
  },
  80001: {
    id: 80001,
    name: 'Mumbai',
    shortName: 'Mumbai',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    testnet: true
  },
  421614: {
    id: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'Arb Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    testnet: true
  },
  84532: {
    id: 84532,
    name: 'Base Sepolia',
    shortName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    testnet: true
  },
  11155420: {
    id: 11155420,
    name: 'Optimism Sepolia',
    shortName: 'OP Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    testnet: true
  }
};

/**
 * Get chain name by chain ID
 * @param chainId The chain ID
 * @returns The chain name or a fallback for unknown chains
 */
export function getChainName(chainId: number): string {
  const chain = CHAIN_REGISTRY[chainId];
  return chain ? chain.shortName : `Chain ${chainId}`;
}

/**
 * Get full chain name by chain ID
 * @param chainId The chain ID
 * @returns The full chain name or a fallback for unknown chains
 */
export function getFullChainName(chainId: number): string {
  const chain = CHAIN_REGISTRY[chainId];
  return chain ? chain.name : `Unknown Chain (${chainId})`;
}

/**
 * Get chain info by chain ID
 * @param chainId The chain ID
 * @returns The chain info or undefined
 */
export function getChainInfo(chainId: number): ChainInfo | undefined {
  return CHAIN_REGISTRY[chainId];
}

/**
 * Check if a chain is a testnet
 * @param chainId The chain ID
 * @returns True if the chain is a testnet
 */
export function isTestnet(chainId: number): boolean {
  const chain = CHAIN_REGISTRY[chainId];
  return chain?.testnet || false;
}

/**
 * Get native currency symbol for a chain
 * @param chainId The chain ID
 * @returns The native currency symbol or 'ETH' as default
 */
export function getNativeCurrencySymbol(chainId: number): string {
  const chain = CHAIN_REGISTRY[chainId];
  return chain?.nativeCurrency.symbol || 'ETH';
}