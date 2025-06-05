/*
  Warnings:

  - You are about to drop the column `profileId` on the `social_profiles` table. All the data in the column will be lost.
  - Added the required column `userId` to the `social_profiles` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_social_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "social_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_social_profiles" ("accessToken", "avatarUrl", "createdAt", "displayName", "id", "provider", "providerId", "refreshToken", "updatedAt", "username") SELECT "accessToken", "avatarUrl", "createdAt", "displayName", "id", "provider", "providerId", "refreshToken", "updatedAt", "username" FROM "social_profiles";
DROP TABLE "social_profiles";
ALTER TABLE "new_social_profiles" RENAME TO "social_profiles";
CREATE UNIQUE INDEX "social_profiles_userId_provider_key" ON "social_profiles"("userId", "provider");
CREATE UNIQUE INDEX "social_profiles_provider_providerId_key" ON "social_profiles"("provider", "providerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
