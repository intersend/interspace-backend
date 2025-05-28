/*
  Warnings:

  - You are about to drop the column `isPreferred` on the `linked_accounts` table. All the data in the column will be lost.
  - Made the column `tags` on table `app_metadata` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_app_metadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "category" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_app_metadata" ("category", "createdAt", "description", "iconUrl", "id", "isVerified", "name", "tags", "updatedAt", "url") SELECT "category", "createdAt", "description", "iconUrl", "id", "isVerified", "name", "tags", "updatedAt", "url" FROM "app_metadata";
DROP TABLE "app_metadata";
ALTER TABLE "new_app_metadata" RENAME TO "app_metadata";
CREATE UNIQUE INDEX "app_metadata_url_key" ON "app_metadata"("url");
CREATE TABLE "new_audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "profileId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_audit_logs" ("action", "createdAt", "details", "id", "ipAddress", "profileId", "resource", "userAgent", "userId") SELECT "action", "createdAt", "details", "id", "ipAddress", "profileId", "resource", "userAgent", "userId" FROM "audit_logs";
DROP TABLE "audit_logs";
ALTER TABLE "new_audit_logs" RENAME TO "audit_logs";
CREATE TABLE "new_linked_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "address" TEXT NOT NULL,
    "authStrategy" TEXT NOT NULL,
    "walletType" TEXT,
    "customName" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "chainId" INTEGER,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "linked_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "linked_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_linked_accounts" ("address", "authStrategy", "chainId", "createdAt", "customName", "id", "isActive", "metadata", "profileId", "updatedAt", "userId", "walletType") SELECT "address", "authStrategy", "chainId", "createdAt", "customName", "id", "isActive", "metadata", "profileId", "updatedAt", "userId", "walletType" FROM "linked_accounts";
DROP TABLE "linked_accounts";
ALTER TABLE "new_linked_accounts" RENAME TO "linked_accounts";
CREATE UNIQUE INDEX "linked_accounts_address_key" ON "linked_accounts"("address");
CREATE UNIQUE INDEX "linked_accounts_userId_address_key" ON "linked_accounts"("userId", "address");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "hashedPassword" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "authStrategies" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "walletAddress" TEXT
);
INSERT INTO "new_users" ("authStrategies", "createdAt", "email", "id", "isGuest", "updatedAt") SELECT "authStrategies", "createdAt", "email", "id", "isGuest", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
