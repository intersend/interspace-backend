import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking app store data...\n');

  // Check categories
  const categories = await prisma.appStoreCategory.findMany();
  console.log(`Categories in database: ${categories.length}`);
  categories.forEach(cat => {
    console.log(`  - ${cat.name} (${cat.slug}) - isActive: ${cat.isActive}`);
  });

  console.log('\n');

  // Check apps
  const apps = await prisma.appStoreApp.findMany({
    include: { category: true }
  });
  console.log(`Apps in database: ${apps.length}`);
  apps.forEach(app => {
    console.log(`  - ${app.name} (${app.category.name}) - isActive: ${app.isActive}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());