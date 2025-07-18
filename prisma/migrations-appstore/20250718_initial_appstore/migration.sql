-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "AppStoreCategory_name_key" ON "AppStoreCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AppStoreCategory_slug_key" ON "AppStoreCategory"("slug");

-- CreateIndex
CREATE INDEX "AppStoreCategory_slug_idx" ON "AppStoreCategory"("slug");

-- CreateIndex
CREATE INDEX "AppStoreCategory_position_idx" ON "AppStoreCategory"("position");

-- CreateIndex
CREATE UNIQUE INDEX "AppStoreApp_shareableId_key" ON "AppStoreApp"("shareableId");

-- CreateIndex
CREATE INDEX "AppStoreApp_categoryId_idx" ON "AppStoreApp"("categoryId");

-- CreateIndex
CREATE INDEX "AppStoreApp_popularity_idx" ON "AppStoreApp"("popularity");

-- CreateIndex
CREATE INDEX "AppStoreApp_isActive_idx" ON "AppStoreApp"("isActive");

-- CreateIndex
CREATE INDEX "AppStoreApp_isFeatured_idx" ON "AppStoreApp"("isFeatured");

-- AddForeignKey
ALTER TABLE "AppStoreApp" ADD CONSTRAINT "AppStoreApp_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AppStoreCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;