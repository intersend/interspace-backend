/*
  Warnings:

  - A unique constraint covering the columns `[userId,address,profileId]` on the table `linked_accounts` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "linked_accounts_userId_address_key";

-- DropIndex
DROP INDEX "linked_accounts_address_key";

-- CreateIndex
CREATE UNIQUE INDEX "linked_accounts_userId_address_profileId_key" ON "linked_accounts"("userId", "address", "profileId");
