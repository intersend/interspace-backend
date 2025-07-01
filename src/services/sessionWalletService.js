/**
 * Session wallet service wrapper for V2 authentication
 * This wraps the blockchain session wallet service for use in the services layer
 */

const { SessionWalletService } = require('../blockchain/sessionWalletService');
const { MockSessionWalletService } = require('../blockchain/mockSessionWalletService');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');

// Create singleton instance based on MPC configuration
let sessionWalletInstance;

if (config.DISABLE_MPC || process.env.DISABLE_MPC === 'true') {
  logger.info('MPC disabled, using mock session wallet service');
  sessionWalletInstance = new MockSessionWalletService();
} else {
  logger.info('Using real session wallet service');
  sessionWalletInstance = new SessionWalletService();
}

/**
 * Create a session wallet for a profile
 * @param {string} profileId - The profile ID
 * @param {Object} clientShare - Client share data (optional for dev mode)
 * @param {boolean} developmentMode - Whether to use development wallet
 * @returns {Promise<{address: string, isDevelopment: boolean, clientShare?: any}>}
 */
async function createSessionWallet(profileId, clientShare, developmentMode = false) {
  try {
    // In development mode or when MPC is disabled, just generate a simple address
    if (developmentMode || config.DISABLE_MPC || process.env.DISABLE_MPC === 'true') {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(profileId || crypto.randomBytes(32)).digest('hex');
      const address = '0x' + hash.slice(0, 40);
      
      logger.info(`Generated development wallet address for profile ${profileId}: ${address}`);
      
      return {
        address: address,
        isDevelopment: true,
        clientShare: {
          p1_key_share: {
            secret_share: crypto.createHash('sha256').update(`secret-${profileId}`).digest('hex'),
            public_key: crypto.createHash('sha256').update(`pubkey-${profileId}`).digest('hex').slice(0, 64)
          },
          public_key: crypto.createHash('sha256').update(`pubkey-${profileId}`).digest('hex').slice(0, 64),
          address: address
        }
      };
    }

    // Use real session wallet service
    const result = await sessionWalletInstance.createSessionWallet(profileId, clientShare);
    return {
      address: result.address,
      isDevelopment: false
    };
  } catch (error) {
    logger.error('Failed to create session wallet:', error);
    throw error;
  }
}

/**
 * Get session wallet address for a profile
 * @param {string} profileId - The profile ID
 * @returns {Promise<string>} The wallet address
 */
async function getSessionWalletAddress(profileId) {
  try {
    return await sessionWalletInstance.getAddress(profileId);
  } catch (error) {
    logger.error('Failed to get session wallet address:', error);
    throw error;
  }
}

/**
 * Sign a transaction with the session wallet
 * @param {string} profileId - The profile ID
 * @param {Object} transaction - The transaction to sign
 * @param {number} chainId - The chain ID
 * @returns {Promise<string>} The signed transaction
 */
async function signTransaction(profileId, transaction, chainId) {
  try {
    return await sessionWalletInstance.signTransaction(profileId, transaction, chainId);
  } catch (error) {
    logger.error('Failed to sign transaction:', error);
    throw error;
  }
}

module.exports = {
  createSessionWallet,
  getSessionWalletAddress,
  signTransaction,
  sessionWalletInstance
};