import { siweService } from '../services/siweService';
import { tokenBlacklistService } from '../services/tokenBlacklistService';
import { logger } from './logger';

export class Scheduler {
  private intervals: NodeJS.Timeout[] = [];

  /**
   * Start all scheduled jobs
   */
  start() {
    logger.info('Starting scheduled jobs...');

    // Clean up expired SIWE nonces every hour
    const siweCleanupInterval = setInterval(async () => {
      try {
        await siweService.cleanupExpiredNonces();
        logger.debug('Cleaned up expired SIWE nonces');
      } catch (error) {
        logger.error('Failed to clean up SIWE nonces:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Clean up expired blacklisted tokens every hour
    const blacklistCleanupInterval = setInterval(async () => {
      try {
        const count = await tokenBlacklistService.cleanupExpiredTokens();
        if (count > 0) {
          logger.info(`Cleaned up ${count} expired blacklisted tokens`);
        }
      } catch (error) {
        logger.error('Failed to clean up blacklisted tokens:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    this.intervals.push(siweCleanupInterval, blacklistCleanupInterval);

    logger.info('Scheduled jobs started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    logger.info('Stopping scheduled jobs...');
    
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    logger.info('Scheduled jobs stopped');
  }
}

export const scheduler = new Scheduler();