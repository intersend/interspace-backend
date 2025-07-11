-- CreateTable PendingAuth (if not exists)
CREATE TABLE IF NOT EXISTS "pending_auths" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "callbackUrl" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_auths_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailVerification (if not exists)
CREATE TABLE IF NOT EXISTS "email_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable FarcasterAuthChannel (if not exists)
CREATE TABLE IF NOT EXISTS "farcaster_auth_channels" (
    "id" TEXT NOT NULL,
    "channelToken" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "siweUri" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "signature" TEXT,
    "fid" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "bio" TEXT,
    "pfpUrl" TEXT,
    "custody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "farcaster_auth_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable AccountDelegation (if not exists)
CREATE TABLE IF NOT EXISTS "account_delegations" (
    "id" TEXT NOT NULL,
    "linkedAccountId" TEXT NOT NULL,
    "sessionWallet" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "delegationType" TEXT NOT NULL DEFAULT 'eip7702',
    "authorizationData" JSONB NOT NULL,
    "permissions" JSONB NOT NULL,
    "nonce" BIGINT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateTable BatchOperation (if not exists)
CREATE TABLE IF NOT EXISTS "batch_operations" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "operations" JSONB NOT NULL,
    "results" JSONB,
    "atomicExecution" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "batch_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for PendingAuth
CREATE UNIQUE INDEX IF NOT EXISTS "pending_auths_nonce_key" ON "pending_auths"("nonce");
CREATE INDEX IF NOT EXISTS "pending_auths_expiresAt_idx" ON "pending_auths"("expiresAt");
CREATE INDEX IF NOT EXISTS "pending_auths_address_idx" ON "pending_auths"("address");

-- CreateIndex for EmailVerification
CREATE INDEX IF NOT EXISTS "email_verifications_email_code_idx" ON "email_verifications"("email", "code");
CREATE INDEX IF NOT EXISTS "email_verifications_expiresAt_idx" ON "email_verifications"("expiresAt");

-- CreateIndex for FarcasterAuthChannel
CREATE UNIQUE INDEX IF NOT EXISTS "farcaster_auth_channels_channelToken_key" ON "farcaster_auth_channels"("channelToken");
CREATE INDEX IF NOT EXISTS "farcaster_auth_channels_expiresAt_idx" ON "farcaster_auth_channels"("expiresAt");
CREATE INDEX IF NOT EXISTS "farcaster_auth_channels_status_idx" ON "farcaster_auth_channels"("status");

-- CreateIndex for AccountDelegation
CREATE INDEX IF NOT EXISTS "account_delegations_linkedAccountId_sessionWallet_chainId_idx" ON "account_delegations"("linkedAccountId", "sessionWallet", "chainId");
CREATE INDEX IF NOT EXISTS "account_delegations_isActive_expiresAt_idx" ON "account_delegations"("isActive", "expiresAt");

-- CreateIndex for BatchOperation
CREATE UNIQUE INDEX IF NOT EXISTS "batch_operations_batchId_key" ON "batch_operations"("batchId");
CREATE INDEX IF NOT EXISTS "batch_operations_profileId_status_idx" ON "batch_operations"("profileId", "status");
CREATE INDEX IF NOT EXISTS "batch_operations_batchId_idx" ON "batch_operations"("batchId");

-- AddForeignKey (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_delegations_linkedAccountId_fkey') THEN
        ALTER TABLE "account_delegations" ADD CONSTRAINT "account_delegations_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "linked_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batch_operations_profileId_fkey') THEN
        ALTER TABLE "batch_operations" ADD CONSTRAINT "batch_operations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;