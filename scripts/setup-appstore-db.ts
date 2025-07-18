import { PrismaClient } from '@prisma/client-appstore';

async function main() {
  console.log('🚀 Setting up App Store Database Tables');
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || process.env.APPSTORE_DATABASE_URL
      }
    }
  });

  try {
    await prisma.$connect();
    console.log('✅ Connected to app store database');

    // Drop existing tables
    console.log('🧹 Dropping existing tables...');
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "AppStoreApp" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "AppStoreCategory" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "_prisma_migrations" CASCADE`);

    // Create AppStoreCategory table
    console.log('📁 Creating AppStoreCategory table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "AppStoreCategory" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT,
        "icon" TEXT,
        "position" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "AppStoreCategory_pkey" PRIMARY KEY ("id")
      )
    `);

    // Create AppStoreApp table
    console.log('📱 Creating AppStoreApp table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "AppStoreApp" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "iconUrl" TEXT,
        "categoryId" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "detailedDescription" TEXT,
        "tags" TEXT[],
        "popularity" INTEGER NOT NULL DEFAULT 0,
        "isNew" BOOLEAN NOT NULL DEFAULT false,
        "isFeatured" BOOLEAN NOT NULL DEFAULT false,
        "chainSupport" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "screenshots" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "developer" TEXT,
        "version" TEXT,
        "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "shareableId" TEXT NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "AppStoreApp_pkey" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    console.log('🔍 Creating indexes...');
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "AppStoreCategory_name_key" ON "AppStoreCategory"("name")`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "AppStoreCategory_slug_key" ON "AppStoreCategory"("slug")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "AppStoreCategory_slug_idx" ON "AppStoreCategory"("slug")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "AppStoreCategory_position_idx" ON "AppStoreCategory"("position")`);

    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "AppStoreApp_shareableId_key" ON "AppStoreApp"("shareableId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "AppStoreApp_categoryId_idx" ON "AppStoreApp"("categoryId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "AppStoreApp_popularity_idx" ON "AppStoreApp"("popularity")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "AppStoreApp_isActive_idx" ON "AppStoreApp"("isActive")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "AppStoreApp_isFeatured_idx" ON "AppStoreApp"("isFeatured")`);

    // Add foreign key
    console.log('🔗 Adding foreign key constraints...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "AppStoreApp" ADD CONSTRAINT "AppStoreApp_categoryId_fkey" 
      FOREIGN KEY ("categoryId") REFERENCES "AppStoreCategory"("id") 
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // Verify tables
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('AppStoreCategory', 'AppStoreApp')
    `;

    console.log('✅ Tables created:', tables);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run with the app store database URL
const dbUrl = process.env.DATABASE_URL || "postgresql://appstore_user:AppStoreUser2024!@104.155.176.64:5432/appstore";
process.env.DATABASE_URL = dbUrl;

main().catch(console.error);