-- AlterTable
ALTER TABLE "users" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "twoFactorSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorBackupCodes" TEXT;
ALTER TABLE "users" ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);