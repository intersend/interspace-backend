-- CreateTable
CREATE TABLE "app_store_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_store_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_store_apps" (
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
    "chainSupport" TEXT[],
    "screenshots" TEXT[],
    "developer" TEXT,
    "version" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "shareableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "app_store_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_store_categories_name_key" ON "app_store_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "app_store_categories_slug_key" ON "app_store_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "app_store_apps_shareableId_key" ON "app_store_apps"("shareableId");

-- CreateIndex
CREATE INDEX "app_store_apps_categoryId_isActive_idx" ON "app_store_apps"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "app_store_apps_isFeatured_isActive_idx" ON "app_store_apps"("isFeatured", "isActive");

-- CreateIndex
CREATE INDEX "app_store_apps_popularity_idx" ON "app_store_apps"("popularity");

-- CreateIndex
CREATE INDEX "app_store_apps_isNew_idx" ON "app_store_apps"("isNew");

-- CreateIndex
CREATE INDEX "app_store_apps_name_idx" ON "app_store_apps"("name");

-- AddForeignKey
ALTER TABLE "app_store_apps" ADD CONSTRAINT "app_store_apps_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "app_store_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;