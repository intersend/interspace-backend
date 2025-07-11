import { prisma } from '../src/utils/database';

async function main() {
  console.log('Testing app store database directly...\n');

  // Test categories
  console.log('=== CATEGORIES ===');
  const categories = await prisma.appStoreCategory.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' }
  });
  console.log(`Found ${categories.length} active categories`);
  categories.forEach(cat => {
    console.log(`  - ${cat.name} (${cat.slug})`);
  });

  console.log('\n=== APPS ===');
  // Test apps
  const allApps = await prisma.appStoreApp.findMany({
    include: { category: true }
  });
  console.log(`Total apps in database: ${allApps.length}`);
  
  const activeApps = await prisma.appStoreApp.findMany({
    where: { isActive: true },
    include: { category: true }
  });
  console.log(`Active apps: ${activeApps.length}`);
  
  const featuredApps = await prisma.appStoreApp.findMany({
    where: { 
      isActive: true,
      isFeatured: true 
    },
    include: { category: true }
  });
  console.log(`Featured apps: ${featuredApps.length}`);
  
  console.log('\nFirst 5 active apps:');
  activeApps.slice(0, 5).forEach(app => {
    console.log(`  - ${app.name} (${app.category.name}) - Featured: ${app.isFeatured}`);
  });

  // Test the service method directly
  console.log('\n=== TESTING SERVICE ===');
  const { appStoreService } = await import('../src/services/appStoreService');
  
  const serviceResult = await appStoreService.getApps({
    sortBy: 'popularity',
    page: 1,
    limit: 20
  });
  
  console.log(`Service returned ${serviceResult.data.length} apps`);
  console.log('Pagination:', serviceResult.pagination);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());