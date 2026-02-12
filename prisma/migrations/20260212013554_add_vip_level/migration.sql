-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vipLevel" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "VipLevelReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vipLevel" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VipLevelReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRewardPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyAmountCents" INTEGER NOT NULL,
    "totalDays" INTEGER NOT NULL DEFAULT 48,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRewardPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRewardClaim" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VipLevelReward_userId_idx" ON "VipLevelReward"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VipLevelReward_userId_vipLevel_key" ON "VipLevelReward"("userId", "vipLevel");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRewardPlan_userId_key" ON "DailyRewardPlan"("userId");

-- CreateIndex
CREATE INDEX "DailyRewardPlan_userId_idx" ON "DailyRewardPlan"("userId");

-- CreateIndex
CREATE INDEX "DailyRewardClaim_userId_idx" ON "DailyRewardClaim"("userId");

-- CreateIndex
CREATE INDEX "DailyRewardClaim_planId_idx" ON "DailyRewardClaim"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRewardClaim_userId_dayIndex_key" ON "DailyRewardClaim"("userId", "dayIndex");

-- AddForeignKey
ALTER TABLE "VipLevelReward" ADD CONSTRAINT "VipLevelReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRewardPlan" ADD CONSTRAINT "DailyRewardPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRewardClaim" ADD CONSTRAINT "DailyRewardClaim_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DailyRewardPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRewardClaim" ADD CONSTRAINT "DailyRewardClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
