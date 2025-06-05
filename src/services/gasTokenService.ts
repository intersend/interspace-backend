import { prisma } from '@/utils/database';
import { orbyService } from './orbyService';
import { SmartProfile } from '@prisma/client';

interface GasTokenScore {
  tokenId: string;
  symbol: string;
  name: string;
  score: number;
  totalBalance: string;
  totalUsdValue: string;
  availableChains: number[];
  isNative: boolean;
  factors: {
    balanceScore: number;
    efficiencyScore: number;
    availabilityScore: number;
    preferenceScore: number;
  };
}

export class GasTokenService {
  /**
   * Analyze and rank available gas tokens for a profile
   */
  async analyzeGasTokens(profile: SmartProfile): Promise<{
    availableTokens: GasTokenScore[];
    suggestedToken: GasTokenScore | null;
    nativeGasAvailable: { chainId: number; amount: string; symbol: string }[];
  }> {
    // Get portfolio from Orby
    const portfolio = await orbyService.getFungibleTokenPortfolio(profile);
    
    const gasTokenScores: GasTokenScore[] = [];
    const nativeGasAvailable: { chainId: number; amount: string; symbol: string }[] = [];
    
    // Analyze each token
    for (const standardizedBalance of portfolio) {
      const { standardizedTokenId, total, tokenBalances } = standardizedBalance;
      
      // Check if it's a native token or stablecoin
      const isNative = this.isNativeToken(tokenBalances[0]?.token);
      const isStablecoin = this.isStablecoin(tokenBalances[0]?.token);
      
      // Calculate availability across chains
      const availableChains = tokenBalances.map(tb => Number(tb.token.chainId));
      
      // Calculate scores
      const balanceScore = this.calculateBalanceScore(total.toRawAmount().toString());
      const efficiencyScore = isNative ? 100 : isStablecoin ? 80 : 60;
      const availabilityScore = (availableChains.length / 5) * 100; // Assuming 5 supported chains
      const preferenceScore = await this.getPreferenceScore(profile.id, standardizedTokenId);
      
      // Overall score (weighted)
      const score = 
        balanceScore * 0.4 +
        efficiencyScore * 0.3 +
        availabilityScore * 0.2 +
        preferenceScore * 0.1;
      
      gasTokenScores.push({
        tokenId: standardizedTokenId,
        symbol: tokenBalances[0]?.token.symbol || 'Unknown',
        name: tokenBalances[0]?.token.name || 'Unknown',
        score,
        totalBalance: total.toRawAmount().toString(),
        totalUsdValue: '0', // USD value calculation would need additional API
        availableChains,
        isNative,
        factors: {
          balanceScore,
          efficiencyScore,
          availabilityScore,
          preferenceScore
        }
      });
      
      // Track native gas availability
      if (isNative) {
        for (const tb of tokenBalances) {
          nativeGasAvailable.push({
            chainId: Number(tb.token.chainId),
            amount: tb.toRawAmount().toString(),
            symbol: tb.token.symbol || 'ETH'
          });
        }
      }
    }
    
    // Sort by score
    gasTokenScores.sort((a, b) => b.score - a.score);
    
    // Get user's preferred token if set
    const preferredToken = await this.getPreferredGasToken(profile.id);
    let suggestedToken = gasTokenScores[0] || null;
    
    // If user has preference and it's available, use it
    if (preferredToken && gasTokenScores.find(t => t.tokenId === preferredToken.standardizedTokenId)) {
      suggestedToken = gasTokenScores.find(t => t.tokenId === preferredToken.standardizedTokenId)!;
    }
    
    return {
      availableTokens: gasTokenScores,
      suggestedToken,
      nativeGasAvailable
    };
  }
  
  /**
   * Set preferred gas token for a profile
   */
  async setPreferredGasToken(
    profileId: string,
    standardizedTokenId: string,
    tokenSymbol: string,
    chainPreferences?: Record<number, string>
  ): Promise<void> {
    await prisma.preferredGasToken.upsert({
      where: { profileId },
      update: {
        standardizedTokenId,
        tokenSymbol,
        chainPreferences: JSON.stringify(chainPreferences || {})
      },
      create: {
        profileId,
        standardizedTokenId,
        tokenSymbol,
        chainPreferences: JSON.stringify(chainPreferences || {})
      }
    });
  }
  
  /**
   * Get preferred gas token for a profile
   */
  private async getPreferredGasToken(profileId: string) {
    return prisma.preferredGasToken.findUnique({
      where: { profileId }
    });
  }
  
  /**
   * Calculate balance score (0-100)
   */
  private calculateBalanceScore(rawAmount: string): number {
    const amount = parseFloat(rawAmount);
    if (amount === 0) return 0;
    if (amount < 10) return 20;
    if (amount < 100) return 50;
    if (amount < 1000) return 80;
    return 100;
  }
  
  /**
   * Get preference score based on usage history
   */
  private async getPreferenceScore(profileId: string, tokenId: string): Promise<number> {
    const preferred = await this.getPreferredGasToken(profileId);
    if (preferred?.standardizedTokenId === tokenId) return 100;
    
    // TODO: Analyze historical usage
    return 50;
  }
  
  /**
   * Check if token is native (ETH, MATIC, etc)
   */
  private isNativeToken(token?: any): boolean {
    if (!token) return false;
    return token.address === '0x0000000000000000000000000000000000000000' ||
           token.address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  }
  
  /**
   * Check if token is stablecoin
   */
  private isStablecoin(token?: any): boolean {
    if (!token) return false;
    const stableSymbols = ['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD'];
    return stableSymbols.includes(token.symbol?.toUpperCase() || '');
  }
}

export const gasTokenService = new GasTokenService();
