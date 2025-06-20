-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "hashedPassword" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authStrategies" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "walletAddress" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorBackupCodes" TEXT,
    "twoFactorEnabledAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_registrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "fingerprint" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "familyId" TEXT,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blacklisted_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blacklisted_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sessionWalletAddress" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "orbyAccountClusterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDevelopmentWallet" BOOLEAN NOT NULL DEFAULT false,
    "createdByAccountId" TEXT,

    CONSTRAINT "smart_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_accounts" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_allowances" (
    "id" TEXT NOT NULL,
    "linkedAccountId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "allowanceAmount" BIGINT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareableId" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarked_apps" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "iconUrl" TEXT,
    "description" TEXT,
    "category" TEXT,
    "developer" TEXT,
    "screenshots" TEXT[],
    "lastUpdated" TIMESTAMP(3),
    "version" TEXT,
    "tags" TEXT[],
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmarked_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "gasUsed" BIGINT,
    "gasPrice" BIGINT,
    "status" TEXT NOT NULL,
    "blockNumber" INTEGER,
    "blockTimestamp" TIMESTAMP(3),
    "nonce" INTEGER,
    "routingType" TEXT,
    "sourceAccount" TEXT,
    "sessionWallet" TEXT,
    "targetApp" TEXT,
    "input" TEXT,
    "logs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_metadata" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "category" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drag_operations" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "details" JSONB,
    "undone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drag_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_wallet_factories" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "factoryAddress" TEXT NOT NULL,
    "implementationAddress" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_wallet_factories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "profileId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "siwe_nonces" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "siwe_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferred_gas_tokens" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "standardizedTokenId" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "chainPreferences" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferred_gas_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orby_virtual_nodes" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "rpcUrl" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orby_virtual_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orby_operations" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "operationSetId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unsignedPayload" TEXT NOT NULL,
    "signedPayload" TEXT,
    "gasToken" TEXT,
    "metadata" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "orby_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orby_transactions" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "hash" TEXT,
    "status" TEXT NOT NULL,
    "gasUsed" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orby_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkey_credentials" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mpc_key_shares" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "serverShare" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpc_key_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mpc_key_mappings" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "silenceLabsKeyId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "keyAlgorithm" TEXT NOT NULL DEFAULT 'ecdsa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpc_key_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMP(3),
    "userId" TEXT,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "identity_links" (
    "id" TEXT NOT NULL,
    "accountAId" TEXT NOT NULL,
    "accountBId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'direct',
    "privacyMode" TEXT NOT NULL DEFAULT 'linked',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_accounts" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_sessions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "privacyMode" TEXT NOT NULL DEFAULT 'linked',
    "activeProfileId" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "device_registrations_deviceId_key" ON "device_registrations"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "blacklisted_tokens_token_key" ON "blacklisted_tokens"("token");

-- CreateIndex
CREATE INDEX "blacklisted_tokens_expiresAt_idx" ON "blacklisted_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "smart_profiles_sessionWalletAddress_key" ON "smart_profiles"("sessionWalletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "smart_profiles_orbyAccountClusterId_key" ON "smart_profiles"("orbyAccountClusterId");

-- CreateIndex
CREATE UNIQUE INDEX "linked_accounts_userId_address_profileId_key" ON "linked_accounts"("userId", "address", "profileId");

-- CreateIndex
CREATE UNIQUE INDEX "token_allowances_linkedAccountId_tokenAddress_chainId_key" ON "token_allowances"("linkedAccountId", "tokenAddress", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "folders_shareableId_key" ON "folders"("shareableId");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_userId_provider_key" ON "social_profiles"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_provider_providerId_key" ON "social_profiles"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_hash_key" ON "transactions"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "app_metadata_url_key" ON "app_metadata"("url");

-- CreateIndex
CREATE INDEX "drag_operations_profileId_createdAt_idx" ON "drag_operations"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "session_wallet_factories_chainId_factoryAddress_key" ON "session_wallet_factories"("chainId", "factoryAddress");

-- CreateIndex
CREATE UNIQUE INDEX "siwe_nonces_nonce_key" ON "siwe_nonces"("nonce");

-- CreateIndex
CREATE INDEX "siwe_nonces_expiresAt_idx" ON "siwe_nonces"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "preferred_gas_tokens_profileId_key" ON "preferred_gas_tokens"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "orby_virtual_nodes_profileId_chainId_key" ON "orby_virtual_nodes"("profileId", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "orby_operations_operationSetId_key" ON "orby_operations"("operationSetId");

-- CreateIndex
CREATE UNIQUE INDEX "passkey_credentials_credentialId_key" ON "passkey_credentials"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "mpc_key_shares_profileId_key" ON "mpc_key_shares"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "mpc_key_mappings_profileId_key" ON "mpc_key_mappings"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "mpc_key_mappings_silenceLabsKeyId_key" ON "mpc_key_mappings"("silenceLabsKeyId");

-- CreateIndex
CREATE INDEX "email_verifications_email_code_idx" ON "email_verifications"("email", "code");

-- CreateIndex
CREATE INDEX "email_verifications_expiresAt_idx" ON "email_verifications"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_type_identifier_key" ON "accounts"("type", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_accountAId_accountBId_key" ON "identity_links"("accountAId", "accountBId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_accounts_profileId_accountId_key" ON "profile_accounts"("profileId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "account_sessions_sessionToken_key" ON "account_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "account_sessions_expiresAt_idx" ON "account_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blacklisted_tokens" ADD CONSTRAINT "blacklisted_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_profiles" ADD CONSTRAINT "smart_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_profiles" ADD CONSTRAINT "smart_profiles_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_allowances" ADD CONSTRAINT "token_allowances_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "linked_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarked_apps" ADD CONSTRAINT "bookmarked_apps_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarked_apps" ADD CONSTRAINT "bookmarked_apps_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drag_operations" ADD CONSTRAINT "drag_operations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drag_operations" ADD CONSTRAINT "drag_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferred_gas_tokens" ADD CONSTRAINT "preferred_gas_tokens_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orby_virtual_nodes" ADD CONSTRAINT "orby_virtual_nodes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orby_operations" ADD CONSTRAINT "orby_operations_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orby_transactions" ADD CONSTRAINT "orby_transactions_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "orby_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpc_key_shares" ADD CONSTRAINT "mpc_key_shares_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mpc_key_mappings" ADD CONSTRAINT "mpc_key_mappings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_accountAId_fkey" FOREIGN KEY ("accountAId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_accountBId_fkey" FOREIGN KEY ("accountBId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_accounts" ADD CONSTRAINT "profile_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_accounts" ADD CONSTRAINT "profile_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_activeProfileId_fkey" FOREIGN KEY ("activeProfileId") REFERENCES "smart_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
