// Common token metadata mapping for when Orby doesn't return full metadata
export const TOKEN_METADATA: Record<string, { symbol: string; name: string; decimals: number }> = {
  // Ethereum Mainnet (Chain 1)
  '0x0000000000000000000000000000000000000000': { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  
  // Polygon (Chain 137)
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': { symbol: 'USDC.e', name: 'USD Coin (PoS)', decimals: 6 },
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  
  // Arbitrum (Chain 42161)
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': { symbol: 'USDC.e', name: 'USD Coin (Arb1)', decimals: 6 },
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  
  // Optimism (Chain 10)
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0x7f5c764cbc14f9669b88837ca1490cca17c31607': { symbol: 'USDC.e', name: 'USD Coin (Bridged)', decimals: 6 },
  '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  //@ts-ignore
  '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  
  // Base (Chain 8453)
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  
  // BSC (Chain 56)
  '0x4db5a66e937a9f4473fa95b1caf1d1e1d62e29ea': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { symbol: 'USDC', name: 'USD Coin', decimals: 18 },
  '0x55d398326f99059ff775485246999027b3197955': { symbol: 'USDT', name: 'Tether USD', decimals: 18 },
};

// Helper function to get token metadata
export function getTokenMetadata(address: string, chainId: number): { symbol: string; name: string; decimals: number } | null {
  const normalizedAddress = address.toLowerCase();
  
  // Check if it's native token (empty or zero address)
  if (!address || normalizedAddress === '0x0000000000000000000000000000000000000000') {
    switch (chainId) {
      case 1:
      case 10:
      case 42161:
      case 8453:
        return { symbol: 'ETH', name: 'Ethereum', decimals: 18 };
      case 137:
        return { symbol: 'MATIC', name: 'Polygon', decimals: 18 };
      case 56:
        return { symbol: 'BNB', name: 'BNB', decimals: 18 };
      default:
        return { symbol: 'Native', name: 'Native Token', decimals: 18 };
    }
  }
  
  return TOKEN_METADATA[normalizedAddress] || null;
}

// Map of common standardized token IDs to symbols (based on Orby patterns)
export const STANDARDIZED_TOKEN_SYMBOLS: Record<string, string> = {
  'sttkn_b504422e0f134eaf8e273acdb67d1c9d': 'ETH',
  'sttkn_fe26388df9394694ad49acb77547e334': 'WETH',
  'sttkn_1e58ac683b9e4d28b1b4193f69c49d12': 'USDC',
  'sttkn_b506454fa0324d7d8be591080542f0f3': 'USDT',
  'sttkn_d9c4c57e9cbf4a32b44850b8a7f3bf21': 'DAI',
  'sttkn_2d717c78cf0e449bb6d81c0bc7c4ee5c': 'MATIC',
  'sttkn_25809ecf579b4c7796d18ebc8de5a493': 'BNB',
};