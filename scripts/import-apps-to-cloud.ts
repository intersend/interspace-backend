import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';

// Define the structure of the JSON file
interface AppData {
  name: string;
  url: string;
  iconUrl: string;
  categoryId: string;
  description: string;
  detailedDescription: string;
  tags: string[];
  popularity: number;
  isNew: boolean;
  isFeatured: boolean;
  developer: string;
  version: string;
  isActive: boolean;
}

interface JsonData {
  apps: AppData[];
}

// Category mapping from JSON categoryId to actual category slugs
const CATEGORY_MAP: Record<string, string> = {
  'defi-category-id': 'defi',
  'nft-category-id': 'nft',
  'gaming-category-id': 'gaming',
  'social-category-id': 'social',
  'tools-category-id': 'tools',
  'dao-category-id': 'dao',
  'bridge-category-id': 'bridge',
  'gambling-category-id': 'gambling',
  'charity-category-id': 'charity',
  'utilities-category-id': 'utilities'
};

// Environment check
const isCloudEnvironment = process.env.GOOGLE_CLOUD_PROJECT || process.env.DATABASE_URL?.includes('cloudsql');

async function main() {
  console.log('🚀 Starting App Store Import to Google Cloud Database');
  console.log('Environment:', isCloudEnvironment ? 'Google Cloud' : 'Local');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Not set');
  
  // Read the JSON file
  const jsonPath = process.argv[2] || '/Users/ardaerturk/Downloads/web3-apps-extended.json';
  console.log('Reading apps from:', jsonPath);
  
  let jsonData: JsonData;
  try {
    const fileContent = readFileSync(jsonPath, 'utf-8');
    jsonData = JSON.parse(fileContent);
    console.log(`✅ Loaded ${jsonData.apps.length} apps from JSON file`);
  } catch (error) {
    console.error('❌ Failed to read JSON file:', error);
    process.exit(1);
  }

  // Initialize Prisma client
  const prisma = new PrismaClient({
    log: ['error', 'warn'],
  });

  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Connected to database');

    // Step 1: Create categories if they don't exist
    console.log('\n📁 Creating/updating categories...');
    const categoryMap = new Map<string, string>(); // slug -> id

    for (const [jsonCategoryId, slug] of Object.entries(CATEGORY_MAP)) {
      const categoryData = {
        name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '),
        slug: slug,
        description: `${slug} applications`,
        icon: getCategoryIcon(slug),
        position: getCategoryPosition(slug),
        isActive: true
      };

      const category = await prisma.appStoreCategory.upsert({
        where: { slug },
        update: categoryData,
        create: categoryData
      });

      categoryMap.set(slug, category.id);
      console.log(`  ✓ Category: ${category.name} (${slug})`);
    }

    // Step 2: Clear existing apps (optional - comment out if you want to keep existing)
    console.log('\n🧹 Clearing existing apps...');
    const deleteCount = await prisma.appStoreApp.deleteMany({});
    console.log(`  ✓ Deleted ${deleteCount.count} existing apps`);

    // Step 3: Import apps
    console.log('\n📱 Importing apps...');
    let successCount = 0;
    let errorCount = 0;

    for (const appData of jsonData.apps) {
      try {
        // Get the correct category ID
        const categorySlug = CATEGORY_MAP[appData.categoryId];
        if (!categorySlug) {
          console.warn(`  ⚠️  Unknown category ID: ${appData.categoryId} for app: ${appData.name}`);
          continue;
        }

        const categoryId = categoryMap.get(categorySlug);
        if (!categoryId) {
          console.warn(`  ⚠️  Category not found: ${categorySlug} for app: ${appData.name}`);
          continue;
        }

        // Create the app
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
            chainSupport: getChainSupport(appData.tags),
            screenshots: [],
            developer: appData.developer,
            version: appData.version,
            lastUpdated: new Date(),
            shareableId: generateShareableId(),
            isActive: appData.isActive !== false // Default to true
          }
        });

        successCount++;
        console.log(`  ✓ ${appData.name}`);
      } catch (error) {
        errorCount++;
        console.error(`  ✗ Failed to import ${appData.name}:`, error);
      }
    }

    // Step 4: Verify import
    console.log('\n📊 Import Summary:');
    console.log(`  ✓ Successfully imported: ${successCount} apps`);
    console.log(`  ✗ Failed: ${errorCount} apps`);

    // Check specific apps
    const fileverse = await prisma.appStoreApp.findFirst({
      where: { name: 'Fileverse' },
      include: { category: true }
    });

    if (fileverse) {
      console.log('\n✅ Fileverse found in database:');
      console.log(`  - URL: ${fileverse.url}`);
      console.log(`  - Category: ${fileverse.category.name}`);
    } else {
      console.log('\n❌ Fileverse NOT found in database');
    }

    // Total count
    const totalApps = await prisma.appStoreApp.count();
    console.log(`\n📱 Total apps in database: ${totalApps}`);

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Helper functions
function getCategoryIcon(slug: string): string {
  const icons: Record<string, string> = {
    'defi': '💰',
    'nft': '🖼️',
    'gaming': '🎮',
    'social': '💬',
    'tools': '🛠️',
    'dao': '🏛️',
    'bridge': '🌉',
    'gambling': '🎲',
    'charity': '❤️',
    'utilities': '⚙️'
  };
  return icons[slug] || '📱';
}

function getCategoryPosition(slug: string): number {
  const positions: Record<string, number> = {
    'defi': 1,
    'tools': 2,
    'gaming': 3,
    'nft': 4,
    'dao': 5,
    'social': 6,
    'bridge': 7,
    'gambling': 8,
    'charity': 9,
    'utilities': 10
  };
  return positions[slug] || 99;
}

function getChainSupport(tags: string[]): string[] {
  // Default chains based on tags
  const chains = ['1']; // Ethereum mainnet
  
  if (tags.includes('polygon')) chains.push('137');
  if (tags.includes('arbitrum')) chains.push('42161');
  if (tags.includes('optimism')) chains.push('10');
  if (tags.includes('base')) chains.push('8453');
  if (tags.includes('bsc')) chains.push('56');
  
  return chains;
}

function generateShareableId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Run the import
main().catch(console.error);