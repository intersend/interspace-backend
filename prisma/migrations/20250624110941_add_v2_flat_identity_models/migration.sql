-- CreateTable: Account (V2 Flat Identity Model)
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "provider" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IdentityLink
CREATE TABLE "identity_links" (
    "id" TEXT NOT NULL,
    "accountAId" TEXT NOT NULL,
    "accountBId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'direct',
    "privacyMode" TEXT NOT NULL DEFAULT 'linked',
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProfileAccount
CREATE TABLE "profile_accounts" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AccountSession
CREATE TABLE "account_sessions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "privacyMode" TEXT NOT NULL DEFAULT 'linked',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("id")
);

-- Now update BlacklistedToken to use accountId instead of userId
-- First, add the accountId column temporarily
ALTER TABLE "blacklisted_tokens" ADD COLUMN "accountId" TEXT;

-- Migrate existing data: create accounts for existing users with blacklisted tokens
INSERT INTO "accounts" ("id", "type", "identifier", "verified", "createdAt", "updatedAt")
SELECT DISTINCT 
    u."id",
    CASE 
        WHEN u."email" IS NOT NULL THEN 'email'
        WHEN u."walletAddress" IS NOT NULL THEN 'wallet'
        ELSE 'unknown'
    END as "type",
    COALESCE(LOWER(u."email"), LOWER(u."walletAddress"), u."id") as "identifier",
    u."emailVerified",
    u."createdAt",
    u."updatedAt"
FROM "users" u
WHERE EXISTS (
    SELECT 1 FROM "blacklisted_tokens" bt WHERE bt."userId" = u."id"
);

-- Update blacklisted_tokens to set accountId based on userId
UPDATE "blacklisted_tokens" bt
SET "accountId" = u."id"
FROM "users" u
WHERE bt."userId" = u."id";

-- Make accountId NOT NULL after data migration
ALTER TABLE "blacklisted_tokens" ALTER COLUMN "accountId" SET NOT NULL;

-- Drop the old userId column and constraint
ALTER TABLE "blacklisted_tokens" DROP CONSTRAINT IF EXISTS "blacklisted_tokens_userId_fkey";
ALTER TABLE "blacklisted_tokens" DROP COLUMN "userId";

-- CreateIndex
CREATE UNIQUE INDEX "accounts_type_identifier_key" ON "accounts"("type", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_accountAId_accountBId_key" ON "identity_links"("accountAId", "accountBId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_accounts_profileId_accountId_key" ON "profile_accounts"("profileId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "account_sessions_sessionId_key" ON "account_sessions"("sessionId");

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_accountAId_fkey" FOREIGN KEY ("accountAId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_accountBId_fkey" FOREIGN KEY ("accountBId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_accounts" ADD CONSTRAINT "profile_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_accounts" ADD CONSTRAINT "profile_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklisted_tokens" ADD CONSTRAINT "blacklisted_tokens_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;