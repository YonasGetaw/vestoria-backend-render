import type { Prisma } from "@prisma/client";

const DAILY_REWARD_CENTS = 30 * 100;
const TOTAL_DAYS = 3650;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + TOTAL_DAYS * 24 * 60 * 60 * 1000);

  await anyTx.dailyRewardPlan.create({
    data: {
      userId: params.userId,
      dailyAmountCents: DAILY_REWARD_CENTS,
      totalDays: TOTAL_DAYS,
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

  if (dayIndex >= Number(plan.totalDays ?? TOTAL_DAYS)) {
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

  const amountCents = DAILY_REWARD_CENTS;

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
    data: { balanceCents: { increment: amountCents } }
  });

  return { claimed: true as const, reason: "claimed" as const, amountCents };
}
