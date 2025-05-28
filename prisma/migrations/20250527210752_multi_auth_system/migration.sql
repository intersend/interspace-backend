/*
  Warnings:

  - You are about to drop the column `isPrimary` on the `linked_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hashedPassword` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `walletAddress` on the `users` table. All the data in the column will be lost.
  - Added the required column `authStrategy` to the `linked_accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `linked_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_linked_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "address" TEXT NOT NULL,
    "authStrategy" TEXT NOT NULL,
    "walletType" TEXT,
    "customName" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "chainId" INTEGER,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "linked_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "linked_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_linked_accounts" ("address", "chainId", "createdAt", "customName", "id", "isActive", "profileId", "updatedAt", "walletType") SELECT "address", "chainId", "createdAt", "customName", "id", "isActive", "profileId", "updatedAt", "walletType" FROM "linked_accounts";
DROP TABLE "linked_accounts";
ALTER TABLE "new_linked_accounts" RENAME TO "linked_accounts";
CREATE UNIQUE INDEX "linked_accounts_address_key" ON "linked_accounts"("address");
CREATE UNIQUE INDEX "linked_accounts_userId_address_key" ON "linked_accounts"("userId", "address");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "authStrategies" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "email", "id", "updatedAt") SELECT "createdAt", "email", "id", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
