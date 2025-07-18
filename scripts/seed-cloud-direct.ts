// Direct seed script for Google Cloud - Simplest method
import { PrismaClient } from '@prisma/client';

// Direct connection string for Google Cloud SQL
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:InterspaceCloud2024!@localhost:5435/interspace_dev';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL
    }
  }
});

// Simple app data with Fileverse
const apps = [
  {
    name: "Fileverse",
    url: "https://ddocs.new",
    iconUrl: "https://cdn.brandfetch.io/idzwCJ2oi9/w/370/h/370/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3",
    category: "utilities",
    description: "Decentralized document collaboration",
    popularity: 90
  },
  {
    name: "Uniswap",
    url: "https://app.uniswap.org",
    iconUrl: "https://cdn.brandfetch.io/idoYtBNi2C/w/800/h/868/theme/dark/logo.png",
    category: "defi",
    description: "Leading DEX for token swaps",
    popularity: 950
  }
];

async function seed() {
  console.log('🌱 Seeding Google Cloud database...');
  
  try {
    // Create categories
    const defi = await prisma.appStoreCategory.upsert({
      where: { slug: 'defi' },
      update: {},
      create: {
        name: 'DeFi',
        slug: 'defi',
        icon: '💰',
        position: 1,
        isActive: true
      }
    });

    const utilities = await prisma.appStoreCategory.upsert({
      where: { slug: 'utilities' },
      update: {},
      create: {
        name: 'Utilities',
        slug: 'utilities',
        icon: '⚙️',
        position: 10,
        isActive: true
      }
    });

    // Add apps
    for (const app of apps) {
      const category = app.category === 'defi' ? defi : utilities;
      
      await prisma.appStoreApp.create({
        data: {
          name: app.name,
          url: app.url,
          iconUrl: app.iconUrl,
          categoryId: category.id,
          description: app.description,
          detailedDescription: app.description,
          tags: [],
          popularity: app.popularity,
          isNew: false,
          isFeatured: false,
          chainSupport: ['1'],
          screenshots: [],
          developer: app.name,
          version: '1.0',
          lastUpdated: new Date(),
          shareableId: Math.random().toString(36).substring(2, 15),
          isActive: true
        }
      });
      console.log(`✅ Added ${app.name}`);
    }

    console.log('✅ Seeding complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();