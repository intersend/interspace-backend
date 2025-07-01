#!/usr/bin/env node
/**
 * Migration script to rename isDevelopmentWallet to developmentMode
 * This script checks if the migration is needed and provides SQL to run
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query']
});

async function checkMigrationNeeded() {
  console.log('🔍 Checking if migration is needed...\n');

  try {
    // Check if the column exists
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'smart_profiles' 
      AND column_name IN ('isDevelopmentWallet', 'developmentMode')
    `;

    const columns = result.map(r => r.column_name);
    
    if (columns.includes('isDevelopmentWallet') && !columns.includes('developmentMode')) {
      console.log('✅ Migration needed: isDevelopmentWallet exists, developmentMode does not');
      console.log('\n📝 Run this SQL to migrate:\n');
      console.log(`ALTER TABLE "smart_profiles" RENAME COLUMN "isDevelopmentWallet" TO "developmentMode";`);
      console.log('\n✅ Then run: npx prisma generate');
    } else if (columns.includes('developmentMode') && !columns.includes('isDevelopmentWallet')) {
      console.log('✅ Migration already completed: developmentMode exists');
    } else if (columns.includes('isDevelopmentWallet') && columns.includes('developmentMode')) {
      console.log('⚠️  Both columns exist - manual intervention needed');
      console.log('You may need to:');
      console.log('1. Copy data from isDevelopmentWallet to developmentMode');
      console.log('2. Drop the isDevelopmentWallet column');
    } else {
      console.log('❌ Neither column exists - something is wrong');
    }

    // Count profiles by development status
    try {
      const devProfiles = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM "smart_profiles" 
        WHERE ${columns.includes('developmentMode') ? prisma.Prisma.sql`"developmentMode"` : prisma.Prisma.sql`"isDevelopmentWallet"`} = true
      `;
      
      const totalProfiles = await prisma.$queryRaw`
        SELECT COUNT(*) as count FROM "smart_profiles"
      `;

      console.log(`\n📊 Profile statistics:`);
      console.log(`   Total profiles: ${totalProfiles[0].count}`);
      console.log(`   Development profiles: ${devProfiles[0].count}`);
      console.log(`   Production profiles: ${totalProfiles[0].count - devProfiles[0].count}`);
    } catch (e) {
      console.log('\n⚠️  Could not get profile statistics');
    }

  } catch (error) {
    console.error('❌ Error checking migration status:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMigrationNeeded().catch(console.error);