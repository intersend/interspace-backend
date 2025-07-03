-- Remove userId columns and User table for flat identity model

-- Step 1: Add accountId columns to tables that have userId
ALTER TABLE "device_registrations" ADD COLUMN "accountId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "accountId" TEXT;

-- Step 2: Migrate existing data (if any)
-- For DeviceRegistration: Try to map users to accounts based on email or wallet
UPDATE "device_registrations" dr
SET "accountId" = (
    SELECT a."id" 
    FROM "accounts" a
    WHERE a."type" = 'email' AND a."identifier" = (
        SELECT LOWER(u."email") 
        FROM "users" u 
        WHERE u."id" = dr."userId"
    )
    LIMIT 1
)
WHERE dr."userId" IS NOT NULL 
AND EXISTS (
    SELECT 1 FROM "users" u WHERE u."id" = dr."userId" AND u."email" IS NOT NULL
);

-- For wallet accounts
UPDATE "device_registrations" dr
SET "accountId" = (
    SELECT a."id" 
    FROM "accounts" a
    WHERE a."type" = 'wallet' AND a."identifier" = (
        SELECT LOWER(u."walletAddress") 
        FROM "users" u 
        WHERE u."id" = dr."userId"
    )
    LIMIT 1
)
WHERE dr."userId" IS NOT NULL 
AND dr."accountId" IS NULL
AND EXISTS (
    SELECT 1 FROM "users" u WHERE u."id" = dr."userId" AND u."walletAddress" IS NOT NULL
);

-- For AuditLog: Similar migration
UPDATE "audit_logs" al
SET "accountId" = (
    SELECT a."id" 
    FROM "accounts" a
    WHERE a."type" = 'email' AND a."identifier" = (
        SELECT LOWER(u."email") 
        FROM "users" u 
        WHERE u."id" = al."userId"
    )
    LIMIT 1
)
WHERE al."userId" IS NOT NULL 
AND EXISTS (
    SELECT 1 FROM "users" u WHERE u."id" = al."userId" AND u."email" IS NOT NULL
);

-- For wallet accounts in audit logs
UPDATE "audit_logs" al
SET "accountId" = (
    SELECT a."id" 
    FROM "accounts" a
    WHERE a."type" = 'wallet' AND a."identifier" = (
        SELECT LOWER(u."walletAddress") 
        FROM "users" u 
        WHERE u."id" = al."userId"
    )
    LIMIT 1
)
WHERE al."userId" IS NOT NULL 
AND al."accountId" IS NULL
AND EXISTS (
    SELECT 1 FROM "users" u WHERE u."id" = al."userId" AND u."walletAddress" IS NOT NULL
);

-- Step 3: Drop foreign key constraints referencing User table
ALTER TABLE "device_registrations" DROP CONSTRAINT IF EXISTS "device_registrations_userId_fkey";

-- Step 4: Drop userId columns
ALTER TABLE "device_registrations" DROP COLUMN "userId";
ALTER TABLE "audit_logs" DROP COLUMN "userId";

-- Step 5: Make accountId NOT NULL for DeviceRegistration (required field)
-- First delete any device registrations that couldn't be migrated
DELETE FROM "device_registrations" WHERE "accountId" IS NULL;
ALTER TABLE "device_registrations" ALTER COLUMN "accountId" SET NOT NULL;

-- AuditLog accountId remains nullable as it was optional before

-- Step 6: Drop any remaining tables/constraints that reference User
-- Drop any other constraints that might exist
DROP TABLE IF EXISTS "passkey_credentials" CASCADE;
DROP TABLE IF EXISTS "social_profiles" CASCADE;
DROP TABLE IF EXISTS "refresh_tokens" CASCADE;
DROP TABLE IF EXISTS "email_verifications" CASCADE;

-- Step 7: Drop the User table
DROP TABLE IF EXISTS "users" CASCADE;

-- Step 8: Add new foreign key constraints
ALTER TABLE "device_registrations" 
    ADD CONSTRAINT "device_registrations_accountId_fkey" 
    FOREIGN KEY ("accountId") 
    REFERENCES "accounts"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" 
    ADD CONSTRAINT "audit_logs_accountId_fkey" 
    FOREIGN KEY ("accountId") 
    REFERENCES "accounts"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;