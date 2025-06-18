#!/usr/bin/env node
/**
 * One-time migration script to encrypt existing sensitive data in the database
 * This script should be run once before deploying the encryption changes to production
 */

import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../src/utils/crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function isEncrypted(value: string): Promise<boolean> {
  try {
    // Try to decrypt - if it succeeds, it's already encrypted
    decrypt(value);
    return true;
  } catch {
    // If decrypt fails, it's not encrypted
    return false;
  }
}

async function encryptMpcKeyShares() {
  console.log('Encrypting MPC key shares...');
  
  const keyShares = await prisma.mpcKeyShare.findMany();
  let encryptedCount = 0;
  
  for (const share of keyShares) {
    // Check if already encrypted
    if (await isEncrypted(share.serverShare)) {
      console.log(`Key share for profile ${share.profileId} is already encrypted`);
      continue;
    }
    
    try {
      // Encrypt the share
      const encryptedShare = encrypt(share.serverShare);
      
      // Update in database
      await prisma.mpcKeyShare.update({
        where: { profileId: share.profileId },
        data: { serverShare: encryptedShare }
      });
      
      encryptedCount++;
      console.log(`Encrypted key share for profile ${share.profileId}`);
    } catch (error) {
      console.error(`Failed to encrypt key share for profile ${share.profileId}:`, error);
    }
  }
  
  console.log(`Encrypted ${encryptedCount} key shares`);
}

async function encryptMpcKeyMappings() {
  console.log('Encrypting MPC key mappings...');
  
  const mappings = await prisma.mpcKeyMapping.findMany();
  let encryptedCount = 0;
  
  for (const mapping of mappings) {
    // Check if already encrypted
    if (await isEncrypted(mapping.silenceLabsKeyId)) {
      console.log(`Key mapping for profile ${mapping.profileId} is already encrypted`);
      continue;
    }
    
    try {
      // Encrypt the key ID
      const encryptedKeyId = encrypt(mapping.silenceLabsKeyId);
      
      // Update in database
      await prisma.mpcKeyMapping.update({
        where: { profileId: mapping.profileId },
        data: { silenceLabsKeyId: encryptedKeyId }
      });
      
      encryptedCount++;
      console.log(`Encrypted key mapping for profile ${mapping.profileId}`);
    } catch (error) {
      console.error(`Failed to encrypt key mapping for profile ${mapping.profileId}:`, error);
    }
  }
  
  console.log(`Encrypted ${encryptedCount} key mappings`);
}

async function encryptSocialTokens() {
  console.log('Encrypting social profile tokens...');
  
  const socialProfiles = await prisma.socialProfile.findMany({
    where: {
      OR: [
        { accessToken: { not: null } },
        { refreshToken: { not: null } }
      ]
    }
  });
  
  let encryptedCount = 0;
  
  for (const profile of socialProfiles) {
    let updated = false;
    const updateData: any = {};
    
    // Check and encrypt access token
    if (profile.accessToken && !(await isEncrypted(profile.accessToken))) {
      updateData.accessToken = encrypt(profile.accessToken);
      updated = true;
    }
    
    // Check and encrypt refresh token
    if (profile.refreshToken && !(await isEncrypted(profile.refreshToken))) {
      updateData.refreshToken = encrypt(profile.refreshToken);
      updated = true;
    }
    
    if (updated) {
      try {
        await prisma.socialProfile.update({
          where: { id: profile.id },
          data: updateData
        });
        
        encryptedCount++;
        console.log(`Encrypted tokens for social profile ${profile.id}`);
      } catch (error) {
        console.error(`Failed to encrypt tokens for social profile ${profile.id}:`, error);
      }
    } else {
      console.log(`Tokens for social profile ${profile.id} are already encrypted`);
    }
  }
  
  console.log(`Encrypted tokens for ${encryptedCount} social profiles`);
}

async function main() {
  console.log('Starting encryption migration...\n');
  
  try {
    // Verify encryption secret is configured
    if (!process.env.ENCRYPTION_SECRET) {
      throw new Error('ENCRYPTION_SECRET is not configured in environment variables');
    }
    
    // Encrypt MPC key shares
    await encryptMpcKeyShares();
    console.log();
    
    // Encrypt MPC key mappings
    await encryptMpcKeyMappings();
    console.log();
    
    // Encrypt social tokens
    await encryptSocialTokens();
    console.log();
    
    console.log('Encryption migration completed successfully!');
  } catch (error) {
    console.error('Encryption migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
main();