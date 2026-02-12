-- CreateTable
CREATE TABLE "SpinChance" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "rewardCents" INTEGER,

    CONSTRAINT "SpinChance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpinChance_referredId_key" ON "SpinChance"("referredId");

-- CreateIndex
CREATE INDEX "SpinChance_referrerId_idx" ON "SpinChance"("referrerId");

-- CreateIndex
CREATE INDEX "SpinChance_referredId_idx" ON "SpinChance"("referredId");

-- CreateIndex
CREATE INDEX "SpinChance_claimedAt_idx" ON "SpinChance"("claimedAt");

-- AddForeignKey
ALTER TABLE "SpinChance" ADD CONSTRAINT "SpinChance_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpinChance" ADD CONSTRAINT "SpinChance_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
