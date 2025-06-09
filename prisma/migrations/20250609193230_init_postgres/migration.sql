-- CreateTable
CREATE TABLE "mpc_key_shares" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "serverShare" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mpc_key_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mpc_key_shares_profileId_key" ON "mpc_key_shares"("profileId");

-- AddForeignKey
ALTER TABLE "mpc_key_shares" ADD CONSTRAINT "mpc_key_shares_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
