import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config();

async function main() {
  console.log('🔍 Verifying App Store Data in Database');
  console.log('=====================================');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Not set');
  console.log('');

  const prisma = new PrismaClient({
    log: ['error', 'warn'],
  });

  try {
    await prisma.$connect();
    console.log('✅ Connected to database\n');

    // Check categories
    const categories = await prisma.appStoreCategory.findMany({
      orderBy: { position: 'asc' },
      include: {
        _count: {
          select: { apps: true }
        }
      }
    });

    console.log(`📁 Categories (${categories.length}):`);
    categories.forEach(cat => {
      console.log(`  ${cat.icon} ${cat.name} (${cat.slug}) - ${cat._count.apps} apps`);
    });

    // Check total apps
    const totalApps = await prisma.appStoreApp.count();
    console.log(`\n📱 Total Apps: ${totalApps}`);

    // Check featured apps
    const featuredApps = await prisma.appStoreApp.findMany({
      where: { isFeatured: true },
      include: { category: true }
    });

    console.log(`\n⭐ Featured Apps (${featuredApps.length}):`);
    featuredApps.forEach(app => {
      console.log(`  - ${app.name} (${app.category.name})`);
    });

    // Check specific apps
    console.log('\n🔍 Checking specific apps:');
    
    const fileverse = await prisma.appStoreApp.findFirst({
      where: { name: 'Fileverse' },
      include: { category: true }
    });
    
    if (fileverse) {
      console.log('  ✅ Fileverse: Found');
      console.log(`     URL: ${fileverse.url}`);
      console.log(`     Category: ${fileverse.category.name}`);
    } else {
      console.log('  ❌ Fileverse: NOT FOUND');
    }

    const axie = await prisma.appStoreApp.findFirst({
      where: { name: 'Axie Infinity' }
    });
    
    if (axie) {
      console.log('  ❌ Axie Infinity: Found (should not be there)');
    } else {
      console.log('  ✅ Axie Infinity: Not found (correct)');
    }

    // Show sample of apps
    const sampleApps = await prisma.appStoreApp.findMany({
      take: 10,
      orderBy: { popularity: 'desc' },
      include: { category: true }
    });

    console.log('\n📊 Top 10 Apps by Popularity:');
    sampleApps.forEach((app, index) => {
      console.log(`  ${index + 1}. ${app.name} (${app.category.name}) - Popularity: ${app.popularity}`);
    });

    // Check for any inactive apps
    const inactiveApps = await prisma.appStoreApp.count({
      where: { isActive: false }
    });

    if (inactiveApps > 0) {
      console.log(`\n⚠️  Warning: ${inactiveApps} inactive apps found`);
    }

    // Summary
    console.log('\n📈 Summary:');
    console.log(`  - Categories: ${categories.length}`);
    console.log(`  - Total Apps: ${totalApps}`);
    console.log(`  - Featured Apps: ${featuredApps.length}`);
    console.log(`  - Fileverse: ${fileverse ? '✅ Present' : '❌ Missing'}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);