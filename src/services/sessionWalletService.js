/**
 * Session wallet service wrapper for V2 authentication
 * This wraps the blockchain session wallet service for use in the services layer
 */

const { SessionWalletService } = require('../blockchain/sessionWalletService');
const { config } = require('../utils/config');
const { logger } = require('../utils/logger');

// Create singleton instance
logger.info('Using real session wallet service');
const sessionWalletInstance = new SessionWalletService();

/**
 * Create a session wallet for a profile
 * @param {string} profileId - The profile ID
 * @param {Object} clientShare - Client share data
 * @returns {Promise<{address: string, placeholder?: boolean}>}
 */
async function createSessionWallet(profileId, clientShare) {
  try {
    // Always generate a placeholder address for now
    // The real MPC wallet will be created when iOS client initiates key generation
    const { ethers } = require('ethers');
    const placeholderWallet = ethers.Wallet.createRandom();
    
    logger.info(`Generated placeholder wallet address for profile ${profileId}: ${placeholderWallet.address}`);
    logger.info(`MPC wallet generation should be triggered by iOS client via /api/v2/mpc/generate`);
    
    return {
      address: placeholderWallet.address,
      placeholder: true
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