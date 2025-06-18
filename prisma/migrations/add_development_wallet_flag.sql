-- Add isDevelopmentWallet field to SmartProfile
ALTER TABLE "smart_profiles" ADD COLUMN "isDevelopmentWallet" BOOLEAN NOT NULL DEFAULT false;