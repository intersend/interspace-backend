-- Drop existing tables if any (be careful!)
DROP TABLE IF EXISTS "AppStoreApp" CASCADE;
DROP TABLE IF EXISTS "AppStoreCategory" CASCADE;
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

-- Create AppStoreCategory table
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
);

-- Create AppStoreApp table
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
);

-- Create indexes
CREATE UNIQUE INDEX "AppStoreCategory_name_key" ON "AppStoreCategory"("name");
CREATE UNIQUE INDEX "AppStoreCategory_slug_key" ON "AppStoreCategory"("slug");
CREATE INDEX "AppStoreCategory_slug_idx" ON "AppStoreCategory"("slug");
CREATE INDEX "AppStoreCategory_position_idx" ON "AppStoreCategory"("position");

CREATE UNIQUE INDEX "AppStoreApp_shareableId_key" ON "AppStoreApp"("shareableId");
CREATE INDEX "AppStoreApp_categoryId_idx" ON "AppStoreApp"("categoryId");
CREATE INDEX "AppStoreApp_popularity_idx" ON "AppStoreApp"("popularity");
CREATE INDEX "AppStoreApp_isActive_idx" ON "AppStoreApp"("isActive");
CREATE INDEX "AppStoreApp_isFeatured_idx" ON "AppStoreApp"("isFeatured");

-- Add foreign key
ALTER TABLE "AppStoreApp" ADD CONSTRAINT "AppStoreApp_categoryId_fkey" 
    FOREIGN KEY ("categoryId") REFERENCES "AppStoreCategory"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Verify tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('AppStoreCategory', 'AppStoreApp');