/*
  Warnings:

  - A unique constraint covering the columns `[orbyAccountClusterId]` on the table `smart_profiles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "smart_profiles" ADD COLUMN "orbyAccountClusterId" TEXT;

-- CreateTable
CREATE TABLE "preferred_gas_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "standardizedTokenId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "chainPreferences" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "preferred_gas_tokens_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "orby_virtual_nodes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "rpcUrl" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orby_virtual_nodes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "orby_operations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "operationSetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unsignedPayload" TEXT NOT NULL,
    "signedPayload" TEXT,
    "gasToken" TEXT,
    "metadata" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "orby_operations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "orby_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "hash" TEXT,
    "status" TEXT NOT NULL,
    "gasUsed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orby_transactions_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "orby_operations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "preferred_gas_tokens_profileId_key" ON "preferred_gas_tokens"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "orby_virtual_nodes_profileId_chainId_key" ON "orby_virtual_nodes"("profileId", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "orby_operations_operationSetId_key" ON "orby_operations"("operationSetId");

-- CreateIndex
CREATE UNIQUE INDEX "smart_profiles_orbyAccountClusterId_key" ON "smart_profiles"("orbyAccountClusterId");
