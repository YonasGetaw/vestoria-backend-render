import type { Prisma } from "@prisma/client";

const TOTAL_DAYS = 48;

function dailyRewardAmountCentsForFirstPurchase(amountCents: number): number | null {
  if (amountCents <= 300 * 100) return 30 * 100;
  if (amountCents === 550 * 100) return 50 * 100;
  if (amountCents === 1100 * 100) return 100 * 100;
  return null;
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

  const dailyAmountCents = dailyRewardAmountCentsForFirstPurchase(params.amountCents);
  if (dailyAmountCents == null) return;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + TOTAL_DAYS * 24 * 60 * 60 * 1000);

  await anyTx.dailyRewardPlan.create({
    data: {
      userId: params.userId,
      dailyAmountCents,
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

  const amountCents = Number(plan.dailyAmountCents);

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
