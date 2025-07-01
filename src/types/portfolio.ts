/**
 * Portfolio and balance related types
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  chainId: string;
  address: string;
}

export interface TokenBalance {
  token: TokenInfo;
  rawAmount: string;
  chainId: string;
}

export interface CachedPortfolioItem {
  standardizedTokenId: string;
  tokenBalances: TokenBalance[];
  tokenBalancesOnChains: Array<{
    chainId: string;
    rawAmount: string;
  }>;
  totalRawAmount: string;
  totalValueInFiat?: string;
}

export interface UnifiedTokenBalance {
  standardizedTokenId: string;
  symbol: string;
  name: string;
  totalAmount: string;
  totalUsdValue: string;
  decimals: number;
  balancesPerChain: Array<{
    chainId: number;
    chainName: string;
    amount: string;
    tokenAddress: string;
    isNative: boolean;
  }>;
}

export interface UnifiedBalance {
  totalUsdValue: string;
  tokens: UnifiedTokenBalance[];
}

export interface GasAnalysisResult {
  suggestedGasToken: any;
  nativeGasAvailable: Array<{
    chainId: number;
    amount: string;
    symbol: string;
  }>;
  availableGasTokens: any[];
}

export interface PortfolioResponse {
  profileId: string;
  profileName: string;
  unifiedBalance: UnifiedBalance;
  gasAnalysis: GasAnalysisResult;
  linkedAccountsCount: number;
}