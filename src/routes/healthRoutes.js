const express = require('express');
const router = express.Router();
const { prisma } = require('../utils/database');
const { logger } = require('../utils/logger');

/**
 * GET /health/linkedaccount-status
 * Check LinkedAccount migration status
 */
router.get('/linkedaccount-status', async (req, res) => {
  try {
    // Check indexes
    const indexes = await prisma.$queryRaw`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'linked_accounts' 
      AND indexname LIKE 'idx_linked_account%'
    `;
    
    // Get statistics
    const stats = await prisma.$queryRaw`
      SELECT 
        COUNT(DISTINCT address) as unique_addresses,
        COUNT(DISTINCT "profileId") as unique_profiles,
        COUNT(DISTINCT "authStrategy") as auth_strategies,
        COUNT(*) as total_links
      FROM "linked_accounts"
      WHERE "isActive" = true
    `;
    
    // Get auth strategy breakdown
    const strategies = await prisma.linkedAccount.groupBy({
      by: ['authStrategy'],
      _count: true,
      where: { isActive: true }
    });
    
    // Check for ProfileAccount entries without LinkedAccount
    const orphanedCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "profile_accounts" pa
      JOIN "accounts" a ON a.id = pa."accountId"
      WHERE NOT EXISTS (
        SELECT 1 FROM "linked_accounts" la
        WHERE la."profileId" = pa."profileId"
        AND la.address = a.identifier
        AND la."isActive" = true
      )
    `;
    
    const status = {
      healthy: indexes.length >= 4,
      indexes: {
        count: indexes.length,
        names: indexes.map(i => i.indexname)
      },
      statistics: {
        uniqueAddresses: Number(stats[0].unique_addresses),
        uniqueProfiles: Number(stats[0].unique_profiles),
        authStrategies: Number(stats[0].auth_strategies),
        totalActiveLinks: Number(stats[0].total_links)
      },
      strategyBreakdown: strategies.reduce((acc, s) => {
        acc[s.authStrategy] = s._count;
        return acc;
      }, {}),
      orphanedProfileAccounts: Number(orphanedCount[0].count),
      migrationComplete: indexes.length >= 4 && Number(orphanedCount[0].count) === 0
    };
    
    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('LinkedAccount status check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check LinkedAccount status',
      message: error.message
    });
  }
});

/**
 * GET /health
 * Basic health check
 */
router.get('/', async (req, res) => {
  try {
    // Simple database connectivity check
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

module.exports = router;