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

-- CreateIndex
CREATE UNIQUE INDEX "mpc_key_mappings_profileId_key" ON "mpc_key_mappings"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "mpc_key_mappings_silenceLabsKeyId_key" ON "mpc_key_mappings"("silenceLabsKeyId");

-- AddForeignKey
ALTER TABLE "mpc_key_mappings" ADD CONSTRAINT "mpc_key_mappings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
