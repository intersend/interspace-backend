-- DropForeignKey
ALTER TABLE "profile_accounts" DROP CONSTRAINT "profile_accounts_profileId_fkey";

-- AddForeignKey
ALTER TABLE "profile_accounts" ADD CONSTRAINT "profile_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;