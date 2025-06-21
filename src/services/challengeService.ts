import crypto from 'crypto';
import { config } from '@/utils/config';

interface Challenge {
  value: string;
  userId?: string;
  type: 'registration' | 'authentication';
  createdAt: Date;
  expiresAt: Date;
}

class ChallengeService {
  private challenges: Map<string, Challenge> = new Map();
  private readonly challengeTTL = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired challenges every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredChallenges();
    }, 60 * 1000);
  }

  /**
   * Generate a new challenge for WebAuthn
   */
  generateChallenge(userId?: string, type: 'registration' | 'authentication' = 'authentication'): string {
    // Generate 32 bytes of random data
    const challengeBuffer = crypto.randomBytes(32);
    const challengeBase64 = challengeBuffer.toString('base64url');
    
    const challenge: Challenge = {
      value: challengeBase64,
      userId,
      type,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.challengeTTL)
    };

    // Store challenge
    this.challenges.set(challengeBase64, challenge);

    return challengeBase64;
  }

  /**
   * Verify and consume a challenge
   */
  verifyChallenge(challengeValue: string, userId?: string, type?: 'registration' | 'authentication'): boolean {
    const challenge = this.challenges.get(challengeValue);

    if (!challenge) {
      console.error('Challenge not found:', challengeValue);
      return false;
    }

    // Check if challenge is expired
    if (challenge.expiresAt < new Date()) {
      console.error('Challenge expired:', challengeValue);
      this.challenges.delete(challengeValue);
      return false;
    }

    // Check if type matches (if specified)
    if (type && challenge.type !== type) {
      console.error('Challenge type mismatch:', { expected: type, actual: challenge.type });
      return false;
    }

    // Check if userId matches (if specified)
    if (userId && challenge.userId && challenge.userId !== userId) {
      console.error('Challenge userId mismatch:', { expected: userId, actual: challenge.userId });
      return false;
    }

    // Challenge is valid, consume it (one-time use)
    this.challenges.delete(challengeValue);
    return true;
  }

  /**
   * Clean up expired challenges
   */
  private cleanupExpiredChallenges(): void {
    const now = new Date();
    const expiredChallenges: string[] = [];

    this.challenges.forEach((challenge, key) => {
      if (challenge.expiresAt < now) {
        expiredChallenges.push(key);
      }
    });

    expiredChallenges.forEach(key => {
      this.challenges.delete(key);
    });

    if (expiredChallenges.length > 0) {
      console.log(`Cleaned up ${expiredChallenges.length} expired challenges`);
    }
  }

  /**
   * Get challenge stats (for monitoring)
   */
  getStats() {
    const now = new Date();
    let activeCount = 0;
    let expiredCount = 0;

    this.challenges.forEach(challenge => {
      if (challenge.expiresAt >= now) {
        activeCount++;
      } else {
        expiredCount++;
      }
    });

    return {
      totalChallenges: this.challenges.size,
      activeChallenges: activeCount,
      expiredChallenges: expiredCount
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.challenges.clear();
  }
}

// Export singleton instance
export const challengeService = new ChallengeService();