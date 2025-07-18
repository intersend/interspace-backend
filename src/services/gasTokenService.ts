import { prisma } from '../utils/database';
import { orbyService } from "./orbyService";
import { SmartProfile } from "@prisma/client";
import { cacheService } from "./cacheService";
import { CachedPortfolioItem, GasAnalysisResult } from '../types/portfolio';

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
    nativeBonus: number;
    preferenceScore: number;
  };
}

export class GasTokenService {
  /**
   * Analyze and rank available gas tokens for a profile
   */
  async analyzeGasTokens(profile: SmartProfile): Promise<GasAnalysisResult> {
    // Check cache first
    const cached = await cacheService.getCachedGasAnalysis(profile.id);
    if (cached) {
      return cached;
    }

    // Get fresh portfolio from Orby (no caching)
    const portfolio: CachedPortfolioItem[] = await orbyService.getFungibleTokenPortfolio(profile);

    const gasTokenScores: GasTokenScore[] = [];
    const nativeGasAvailable: {
      chainId: number;
      amount: string;
      symbol: string;
    }[] = [];

    // Determine total balance for weighting
    const totalBalance = portfolio.reduce(
      (acc, item) => acc + BigInt(item.totalRawAmount || '0'),
      0n
    );

    const preferred = await this.getPreferredGasToken(profile.id);

    for (const item of portfolio) {
      const { standardizedTokenId, totalRawAmount, tokenBalances } = item;

      const token = tokenBalances[0]?.token;
      if (!token) continue;

      const balanceRaw = BigInt(totalRawAmount || '0');
      if (balanceRaw === 0n) continue;

      const isNative = this.isNativeToken(token);
      const availableChains = tokenBalances.map(tb => Number(tb.chainId));

      const balanceScore =
        totalBalance === 0n ? 0 : Number((balanceRaw * 100n) / totalBalance);
      const nativeBonus = isNative ? 50 : 0;
      const preferenceScore = await this.getPreferenceScore(
        profile.id,
        standardizedTokenId
      );

      const score = balanceScore * 0.2 + nativeBonus + preferenceScore * 0.3;

      gasTokenScores.push({
        tokenId: standardizedTokenId,
        symbol: token.symbol || "Unknown",
        name: token.name || "Unknown",
        score,
        totalBalance: totalRawAmount,
        totalUsdValue: item.totalValueInFiat || "0",
        availableChains,
        isNative,
        factors: { balanceScore, nativeBonus, preferenceScore }
      });

      if (isNative) {
        for (const tb of tokenBalances) {
          nativeGasAvailable.push({
            chainId: Number(tb.chainId),
            amount: tb.rawAmount,
            symbol: token.symbol || "ETH"
          });
        }
      }
    }

    gasTokenScores.sort((a, b) => b.score - a.score);

    let suggestedToken: GasTokenScore | null = gasTokenScores[0] || null;
    if (
      preferred &&
      gasTokenScores.find((t) => t.tokenId === preferred.standardizedTokenId)
    ) {
      suggestedToken = gasTokenScores.find(
        (t) => t.tokenId === preferred.standardizedTokenId,
      )!;
    }

    const result: GasAnalysisResult = {
      availableGasTokens: gasTokenScores,
      suggestedGasToken: suggestedToken,
      nativeGasAvailable,
    };

    // Cache the result
    await cacheService.setCachedGasAnalysis(profile.id, result);

    return result;
  }

  /**
   * Set preferred gas token for a profile
   */
  async setPreferredGasToken(
    profileId: string,
    standardizedTokenId: string,
    tokenSymbol: string,
    chainPreferences?: Record<number, string>,
  ): Promise<void> {
    await prisma.preferredGasToken.upsert({
      where: { profileId },
      update: {
        standardizedTokenId,
        tokenSymbol,
        chainPreferences: JSON.stringify(chainPreferences || {}),
      },
      create: {
        profileId,
        standardizedTokenId,
        tokenSymbol,
        chainPreferences: JSON.stringify(chainPreferences || {}),
      },
    });

    // Invalidate gas analysis cache when preference changes
    await cacheService.invalidateGasAnalysisCache(profileId);
  }

  /**
   * Get preferred gas token for a profile
   */
  private async getPreferredGasToken(profileId: string) {
    return prisma.preferredGasToken.findUnique({
      where: { profileId },
    });
  }

  /**
   * Get preference score based on usage history
   */
  private async getPreferenceScore(
    profileId: string,
    tokenId: string,
  ): Promise<number> {
    const preferred = await this.getPreferredGasToken(profileId);
    if (preferred?.standardizedTokenId === tokenId) return 100;

    // Analyze historical usage based on past Orby operations
    const [usageCount, totalCount] = await Promise.all([
      prisma.orbyOperation.count({
        where: {
          profileId,
          gasToken: {
            contains: tokenId,
          },
          status: {
            in: ["successful", "pending"],
          },
        },
      }),
      prisma.orbyOperation.count({
        where: {
          profileId,
          status: {
            in: ["successful", "pending"],
          },
        },
      }),
    ]);

    if (totalCount === 0) return 0;

    // Score between 0 and 100 based on usage percentage
    return Math.min(100, Math.round((usageCount / totalCount) * 100));
  }

  /**
   * Check if token is native (ETH, MATIC, etc)
   */
  private isNativeToken(token?: any): boolean {
    if (!token) return false;
    return (
      token.address === "0x0000000000000000000000000000000000000000" ||
      token.address === "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
    );
  }

  /**
   * Check if token is stablecoin
   */
  private isStablecoin(token?: any): boolean {
    if (!token) return false;
    const stableSymbols = ["USDC", "USDT", "DAI", "BUSD", "TUSD"];
    return stableSymbols.includes(token.symbol?.toUpperCase() || "");
  }
}

export const gasTokenService = new GasTokenService();
