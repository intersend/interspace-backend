-- CreateTable
CREATE TABLE "mpc_key_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "p1Share" TEXT NOT NULL,
    "p2Share" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mpc_key_shares_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "smart_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "mpc_key_shares_profileId_key" ON "mpc_key_shares"("profileId");
