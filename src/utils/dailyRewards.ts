import type { Prisma } from "@prisma/client";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Daily reward tiers based on total deposits
function getDailyRewardForDeposits(totalDepositCents: number) {
  if (totalDepositCents >= 1100 * 100) return 70 * 100; // 70 birr
  if (totalDepositCents >= 550 * 100) return 25 * 100;  // 25 birr
  return 0; // no daily reward until 550 birr deposited
}

// Bonus assets based on total deposits
function getBonusAssetsForDeposits(totalDepositCents: number) {
  if (totalDepositCents >= 550 * 100) return 100 * 100; // 100 birr assets at 550 (first time only)
  return 0; // no bonus until 550 birr deposited
}

export async function ensureDailyRewardPlanForFirstApprovedPurchase(
  tx: Prisma.TransactionClient,
  params: { userId: string; orderId: string; amountCents: number }
) {
  const anyTx = tx as any;

  const existingPlan = await anyTx.dailyRewardPlan.findUnique({
    where: { userId: params.userId }
  });
  if (existingPlan) return;

  const approvedCount = await tx.order.count({
    where: {
      userId: params.userId,
      status: { in: ["APPROVED", "COMPLETED"] },
      id: { not: params.orderId }
    }
  });
  if (approvedCount > 0) return;

  // Calculate total deposits for this user
  const depositResult = await anyTx.order.aggregate({
    where: {
      userId: params.userId,
      status: { in: ["APPROVED", "COMPLETED"] }
    },
    _sum: { amountCents: true }
  });
  const totalDepositCents = depositResult._sum.amountCents || 0;

  // Determine daily reward amount
  const dailyAmountCents = getDailyRewardForDeposits(totalDepositCents);
  if (dailyAmountCents === 0) return; // No daily reward yet

  // Award bonus assets if threshold reached
  const bonusAssetsCents = getBonusAssetsForDeposits(totalDepositCents);
  if (bonusAssetsCents > 0) {
    await tx.user.update({
      where: { id: params.userId },
      data: { 
        assetsCents: { increment: bonusAssetsCents }
      }
    });
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 3650 * 24 * 60 * 60 * 1000);

  await anyTx.dailyRewardPlan.create({
    data: {
      userId: params.userId,
      dailyAmountCents,
      totalDays: 3650,
      startsAt,
      endsAt
    }
  });
}

export async function claimDailyReward(tx: Prisma.TransactionClient, userId: string) {
  const anyTx = tx as any;

  const plan = await anyTx.dailyRewardPlan.findUnique({
    where: { userId }
  });
  if (!plan) {
    return { claimed: false as const, reason: "no_plan" as const, amountCents: 0 };
  }

  const now = new Date();
  if (now > new Date(plan.endsAt)) {
    return { claimed: false as const, reason: "plan_ended" as const, amountCents: 0 };
  }

  const lastClaim = await anyTx.dailyRewardClaim.findFirst({
    where: { userId },
    orderBy: { claimedAt: "desc" }
  });
  if (lastClaim) {
    const nextAt = new Date(new Date(lastClaim.claimedAt).getTime() + COOLDOWN_MS);
    if (now.getTime() < nextAt.getTime()) {
      return {
        claimed: false as const,
        reason: "already_claimed" as const,
        amountCents: 0,
        nextAt
      };
    }
  }

  const startsAt = new Date(plan.startsAt);
  const elapsedMs = Math.max(0, now.getTime() - startsAt.getTime());
  const dayIndex = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  if (dayIndex >= Number(plan.totalDays ?? 3650)) {
    return { claimed: false as const, reason: "plan_ended" as const, amountCents: 0 };
  }

  const existing = await anyTx.dailyRewardClaim.findUnique({
    where: {
      userId_dayIndex: {
        userId,
        dayIndex
      }
    }
  });
  if (existing) {
    return { claimed: false as const, reason: "already_claimed" as const, amountCents: 0 };
  }

  const amountCents = plan.dailyAmountCents;

  await anyTx.dailyRewardClaim.create({
    data: {
      planId: plan.id,
      userId,
      dayIndex,
      amountCents
    }
  });

  await tx.user.update({
    where: { id: userId },
    data: { assetsCents: { increment: amountCents } }
  });

  return { claimed: true as const, reason: "claimed" as const, amountCents };
}
