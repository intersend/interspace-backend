-- CreateTable
CREATE TABLE "passkey_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "passkey_credentials_credentialId_key" ON "passkey_credentials"("credentialId");
