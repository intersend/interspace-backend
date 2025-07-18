import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Temporary seed endpoint - REMOVE AFTER USE
router.get('/temp-seed-fileverse', async (req, res) => {
  try {
    // Simple security check
    if (req.query.secret !== 'temp2024') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Create utilities category
    const category = await prisma.appStoreCategory.upsert({
      where: { slug: 'utilities' },
      update: {},
      create: {
        name: 'Utilities',
        slug: 'utilities',
        description: 'Utility applications',
        icon: '⚙️',
        position: 10,
        isActive: true
      }
    });

    // Create Fileverse app
    const fileverse = await prisma.appStoreApp.create({
      data: {
        name: 'Fileverse',
        url: 'https://ddocs.new',
        iconUrl: 'https://cdn.brandfetch.io/idzwCJ2oi9/w/370/h/370/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3',
        categoryId: category.id,
        description: 'Decentralized document collaboration',
        detailedDescription: 'Fileverse provides decentralized document creation and collaboration tools.',
        tags: ['documents', 'collaboration', 'decentralized'],
        popularity: 90,
        isNew: false,
        isFeatured: false,
        chainSupport: ['1'],
        screenshots: [],
        developer: 'Fileverse',
        version: '1.0',
        lastUpdated: new Date(),
        shareableId: 'fileverse001',
        isActive: true
      }
    });

    res.json({ 
      success: true, 
      message: 'Fileverse added successfully',
      app: fileverse.name,
      category: category.name
    });

  } catch (error: any) {
    console.error('Seed error:', error);
    res.status(500).json({ 
      error: 'Failed to seed', 
      details: error.message 
    });
  }
});

export default router;