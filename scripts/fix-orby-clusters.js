#!/usr/bin/env node

/**
 * Migration script to fix Orby clusters for profiles with placeholder addresses
 * This script will:
 * 1. Find all profiles that have an Orby cluster ID
 * 2. Check if the session wallet in the cluster matches the profile's session wallet
 * 3. Update the Orby cluster if there's a mismatch
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function fixOrbyCluster(profile) {
  try {
    log(`\nChecking profile: ${profile.name} (${profile.id})`, 'cyan');
    log(`  Session Wallet: ${profile.sessionWalletAddress}`, 'blue');
    log(`  Orby Cluster ID: ${profile.orbyAccountClusterId}`, 'blue');
    
    // Import orbyService to update the cluster
    const { orbyService } = require('../dist/services/orbyService');
    
    try {
      // Update the Orby cluster
      await orbyService.updateAccountCluster(profile.id);
      log(`  ✓ Orby cluster updated successfully`, 'green');
      return { success: true, profileId: profile.id };
    } catch (error) {
      log(`  ✗ Failed to update Orby cluster: ${error.message}`, 'red');
      return { success: false, profileId: profile.id, error: error.message };
    }
  } catch (error) {
    log(`  ✗ Error processing profile: ${error.message}`, 'red');
    return { success: false, profileId: profile.id, error: error.message };
  }
}

async function main() {
  try {
    log('\n=== Orby Cluster Fix Migration ===\n', 'cyan');
    
    // Step 1: Find all profiles with Orby cluster IDs
    log('1. Finding profiles with Orby clusters...', 'yellow');
    const profiles = await prisma.smartProfile.findMany({
      where: {
        orbyAccountClusterId: {
          not: null
        }
      }
    });
    
    log(`Found ${profiles.length} profiles with Orby clusters`, 'green');
    
    if (profiles.length === 0) {
      log('\nNo profiles to fix. Exiting.', 'yellow');
      return;
    }
    
    // Step 2: Check for profiles with potential placeholder addresses
    log('\n2. Checking for profiles with potential issues...', 'yellow');
    
    // Filter profiles that might have placeholder addresses
    // Placeholder addresses are random and don't have associated MPC keys
    const profilesWithKeys = await prisma.mpcKeyMapping.findMany({
      select: { profileId: true }
    });
    const profileIdsWithKeys = new Set(profilesWithKeys.map(k => k.profileId));
    
    const profilesNeedingUpdate = profiles.filter(profile => {
      // If the profile doesn't have an MPC key mapping, it might have a placeholder
      return !profileIdsWithKeys.has(profile.id);
    });
    
    log(`Found ${profilesNeedingUpdate.length} profiles that might need updating`, 
        profilesNeedingUpdate.length > 0 ? 'yellow' : 'green');
    
    // Step 3: Update all profiles (even ones with keys, to ensure consistency)
    log('\n3. Updating Orby clusters for all profiles...', 'yellow');
    
    const results = [];
    for (const profile of profiles) {
      const result = await fixOrbyCluster(profile);
      results.push(result);
    }
    
    // Step 4: Summary
    log('\n=== Summary ===', 'cyan');
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    log(`Total profiles processed: ${results.length}`, 'blue');
    log(`Successful updates: ${successful}`, 'green');
    log(`Failed updates: ${failed}`, failed > 0 ? 'red' : 'green');
    
    if (failed > 0) {
      log('\nFailed profiles:', 'red');
      results.filter(r => !r.success).forEach(r => {
        log(`  - ${r.profileId}: ${r.error}`, 'red');
      });
    }
    
    log('\n✓ Migration completed\n', 'green');
    
  } catch (error) {
    log(`\n✗ Migration failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
main().catch(error => {
  log(`\n✗ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});