import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

// Category mapping
const CATEGORY_MAP: Record<string, { name: string; slug: string; icon: string; position: number }> = {
  'defi-category-id': { name: 'DeFi', slug: 'defi', icon: '💰', position: 1 },
  'nft-category-id': { name: 'NFT', slug: 'nft', icon: '🖼️', position: 4 },
  'gaming-category-id': { name: 'Gaming', slug: 'gaming', icon: '🎮', position: 3 },
  'social-category-id': { name: 'Social', slug: 'social', icon: '💬', position: 6 },
  'tools-category-id': { name: 'Tools', slug: 'tools', icon: '🛠️', position: 2 },
  'dao-category-id': { name: 'DAO', slug: 'dao', icon: '🏛️', position: 5 },
  'bridge-category-id': { name: 'Bridge', slug: 'bridge', icon: '🌉', position: 7 },
  'gambling-category-id': { name: 'Gambling', slug: 'gambling', icon: '🎲', position: 8 },
  'charity-category-id': { name: 'Charity', slug: 'charity', icon: '❤️', position: 9 },
  'utilities-category-id': { name: 'Utilities', slug: 'utilities', icon: '⚙️', position: 10 }
};

// Hardcoded apps data
const APPS_DATA = {
  apps: [
    {
      name: "Fileverse",
      url: "https://ddocs.new",
      iconUrl: "https://cdn.brandfetch.io/idzwCJ2oi9/w/370/h/370/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3",
      categoryId: "utilities-category-id",
      description: "Decentralized document collaboration",
      detailedDescription: "Fileverse provides decentralized document creation and collaboration tools.",
      tags: ["documents", "collaboration", "decentralized"],
      popularity: 90,
      isNew: false,
      isFeatured: false,
      developer: "Fileverse",
      version: "1.0",
      isActive: true
    },
    // Add more apps as needed
  ]
};

router.post('/seed-app-store', async (req: Request, res: Response) => {
  try {
    // Secret key check for security
    const secretKey = req.headers['x-seed-secret'];
    if (secretKey !== 'temporary-seed-2024') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Clear existing data
    await prisma.appStoreApp.deleteMany({});
    await prisma.appStoreCategory.deleteMany({});

    // Create categories
    const categoryIds = new Map<string, string>();
    
    for (const [jsonId, cat] of Object.entries(CATEGORY_MAP)) {
      const category = await prisma.appStoreCategory.create({
        data: {
          name: cat.name,
          slug: cat.slug,
          description: `${cat.name} applications`,
          icon: cat.icon,
          position: cat.position,
          isActive: true
        }
      });
      categoryIds.set(jsonId, category.id);
    }

    // Create apps
    let successCount = 0;
    for (const appData of APPS_DATA.apps) {
      const categoryId = categoryIds.get(appData.categoryId);
      if (!categoryId) continue;

      await prisma.appStoreApp.create({
        data: {
          name: appData.name,
          url: appData.url,
          iconUrl: appData.iconUrl,
          categoryId: categoryId,
          description: appData.description,
          detailedDescription: appData.detailedDescription,
          tags: appData.tags,
          popularity: appData.popularity,
          isNew: appData.isNew,
          isFeatured: appData.isFeatured,
          chainSupport: ['1'],
          screenshots: [],
          developer: appData.developer,
          version: appData.version,
          lastUpdated: new Date(),
          shareableId: Math.random().toString(36).substring(2, 15),
          isActive: appData.isActive
        }
      });
      successCount++;
    }

    res.json({ 
      success: true, 
      message: `Seeded ${successCount} apps and ${categoryIds.size} categories`,
      apps: successCount,
      categories: categoryIds.size 
    });

  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Failed to seed data' });
  }
});

export default router;