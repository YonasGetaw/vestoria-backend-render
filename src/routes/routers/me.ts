import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { prisma } from "../../db/prisma.js";
import { hashPassword, verifyPassword } from "../../utils/password.js";
import { claimDailyReward } from "../../utils/dailyRewards.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      referralCode: true,
      points: true,
      balanceCents: true,
      assetsCents: true,
      reservedBalanceCents: true,
      withdrawPasswordHash: true
    }
  });

  const teamCount = await prisma.user.count({ where: { referredById: userId } });

  return res.json({
    user: user
      ? {
          ...user,
          vipLevel: (user as any).vipLevel ?? 1,
          hasWithdrawPassword: Boolean(user.withdrawPasswordHash),
          withdrawPasswordHash: undefined
        }
      : null,
    teamCount
  });
});

meRouter.get("/account-stats", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [user, rechargeAgg, withdrawAgg, teamIncomeAgg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { assetsCents: true, reservedBalanceCents: true } }),
    prisma.order.aggregate({
      where: { userId, status: { in: ["APPROVED", "COMPLETED"] } },
      _sum: { amountCents: true }
    }),
    prisma.withdrawal.aggregate({
      where: { userId },
      _sum: { amountCents: true }
    }),
    prisma.referralBonus.aggregate({
      where: { referrerId: userId },
      _sum: { amountCents: true }
    })
  ]);

  const totalRechargeCents = rechargeAgg._sum.amountCents ?? 0;
  const totalWithdrawCents = withdrawAgg._sum.amountCents ?? 0;
  const totalAssetsCents = (user?.assetsCents ?? 0) + (user?.reservedBalanceCents ?? 0);
  const teamIncomeCents = teamIncomeAgg._sum.amountCents ?? 0;

  const anyPrisma = prisma as any;

  const [vipRewardsTotalAgg, vipRewardsTodayAgg, dailyTotalAgg, dailyTodayAgg, teamIncomeTodayAgg] = await Promise.all([
    anyPrisma.vipLevelReward.aggregate({ where: { userId }, _sum: { amountCents: true } }).catch(() => ({ _sum: { amountCents: 0 } })),
    anyPrisma.vipLevelReward.aggregate({ where: { userId, createdAt: { gte: startOfDay, lt: endOfDay } }, _sum: { amountCents: true } }).catch(() => ({ _sum: { amountCents: 0 } })),
    anyPrisma.dailyRewardClaim.aggregate({ where: { userId }, _sum: { amountCents: true } }).catch(() => ({ _sum: { amountCents: 0 } })),
    anyPrisma.dailyRewardClaim.aggregate({ where: { userId, claimedAt: { gte: startOfDay, lt: endOfDay } }, _sum: { amountCents: true } }).catch(() => ({ _sum: { amountCents: 0 } })),
    prisma.referralBonus.aggregate({ where: { referrerId: userId, createdAt: { gte: startOfDay, lt: endOfDay } }, _sum: { amountCents: true } })
  ]);

  const vipRewardsCents = vipRewardsTotalAgg?._sum?.amountCents ?? 0;
  const vipRewardsTodayCents = vipRewardsTodayAgg?._sum?.amountCents ?? 0;
  const dailyRewardsCents = dailyTotalAgg?._sum?.amountCents ?? 0;
  const dailyRewardsTodayCents = dailyTodayAgg?._sum?.amountCents ?? 0;
  const teamIncomeTodayCents = teamIncomeTodayAgg._sum.amountCents ?? 0;

  const todayIncomeCents = teamIncomeTodayCents + vipRewardsTodayCents + dailyRewardsTodayCents;
  const totalIncomeCents = teamIncomeCents + vipRewardsCents + dailyRewardsCents;

  return res.json({
    totalRechargeCents,
    totalWithdrawCents,
    totalAssetsCents,
    todayIncomeCents,
    teamIncomeCents,
    totalIncomeCents
  });
});

meRouter.post("/claim-daily-reward", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;

  const result = await prisma.$transaction(async (tx) => {
    return claimDailyReward(tx, userId);
  });

  return res.json(result);
});

meRouter.get("/daily-reward-status", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const anyPrisma = prisma as any;

  const plan = await anyPrisma.dailyRewardPlan.findUnique({ where: { userId } }).catch(() => null);
  if (!plan) {
    return res.json({ eligible: false as const, reason: "no_plan" as const, amountCents: 0 });
  }

  const now = new Date();
  if (now > new Date(plan.endsAt)) {
    return res.json({ eligible: false as const, reason: "plan_ended" as const, amountCents: 0 });
  }

  const lastClaim = await anyPrisma.dailyRewardClaim
    .findFirst({ where: { userId }, orderBy: { claimedAt: "desc" } })
    .catch(() => null);

  const cooldownMs = 24 * 60 * 60 * 1000;
  const nextAt = lastClaim ? new Date(new Date(lastClaim.claimedAt).getTime() + cooldownMs) : null;
  const eligible = !nextAt || now.getTime() >= nextAt.getTime();

  return res.json({ eligible, amountCents: Number(plan.dailyAmountCents ?? 0), nextAt: eligible ? null : nextAt });
});

meRouter.get("/spin-status", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const anyPrisma = prisma as any;

  const pending = await anyPrisma.spinChance
    .findFirst({ where: { referrerId: userId, claimedAt: null }, orderBy: { grantedAt: "asc" } })
    .catch(() => null);

  return res.json({
    eligible: Boolean(pending),
    pendingCount: pending ? 1 : 0
  });
});

meRouter.get("/activity", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const anyPrisma = prisma as any;

  const [orders, withdrawals, sentTx, receivedTx, dailyClaims, spinClaims] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      select: {
        id: true,
        amountCents: true,
        status: true,
        createdAt: true,
        product: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    }),
    prisma.withdrawal.findMany({
      where: { userId },
      select: {
        id: true,
        amountCents: true,
        status: true,
        method: true,
        createdAt: true,
        approvedAt: true,
        rejectedAt: true
      },
      orderBy: { createdAt: "desc" },
      take: limit
    }),
    prisma.transaction.findMany({
      where: { fromUserId: userId },
      select: {
        id: true,
        amountCents: true,
        type: true,
        createdAt: true,
        toUser: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    }),
    prisma.transaction.findMany({
      where: { toUserId: userId },
      select: {
        id: true,
        amountCents: true,
        type: true,
        createdAt: true,
        fromUser: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      take: limit
    }),
    anyPrisma.dailyRewardClaim
      .findMany({
        where: { userId },
        select: { id: true, amountCents: true, claimedAt: true },
        orderBy: { claimedAt: "desc" },
        take: limit
      })
      .catch(() => [] as Array<{ id: string; amountCents: number; claimedAt: Date }>),
    anyPrisma.spinChance
      .findMany({
        where: { referrerId: userId, claimedAt: { not: null } },
        select: { id: true, rewardCents: true, claimedAt: true },
        orderBy: { claimedAt: "desc" },
        take: limit
      })
      .catch(() => [] as Array<{ id: string; rewardCents: number | null; claimedAt: Date | null }>)
  ]);

  const items = [
    ...orders.map((o) => ({
      id: `order:${o.id}`,
      kind: "ORDER" as const,
      amountCents: o.amountCents,
      createdAt: o.createdAt,
      meta: { status: o.status, productId: o.product.id, productName: o.product.name }
    })),
    ...withdrawals.map((w) => ({
      id: `withdrawal:${w.id}`,
      kind: "WITHDRAWAL" as const,
      amountCents: w.amountCents,
      createdAt: w.createdAt,
      meta: { status: w.status, method: w.method, approvedAt: w.approvedAt, rejectedAt: w.rejectedAt }
    })),
    ...sentTx.map((t) => ({
      id: `tx:${t.id}`,
      kind: "SEND" as const,
      amountCents: t.amountCents,
      createdAt: t.createdAt,
      meta: { to: t.toUser }
    })),
    ...receivedTx.map((t) => ({
      id: `tx:${t.id}`,
      kind: "RECEIVE" as const,
      amountCents: t.amountCents,
      createdAt: t.createdAt,
      meta: { from: t.fromUser }
    })),
    ...dailyClaims.map((c) => ({
      id: `daily:${c.id}`,
      kind: "DAILY_REWARD" as const,
      amountCents: c.amountCents,
      createdAt: c.claimedAt,
      meta: {}
    })),
    ...spinClaims.map((c) => ({
      id: `spin:${c.id}`,
      kind: "SPIN_REWARD" as const,
      amountCents: c.rewardCents ?? 0,
      createdAt: c.claimedAt ?? new Date(0),
      meta: {}
    }))
  ]
    .filter((i) => i.createdAt instanceof Date && !Number.isNaN(i.createdAt.getTime()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return res.json({ items });
});

meRouter.post("/claim-spin", requireAuth, async (req, res) => {
  const userId = req.auth!.sub;
  const anyPrisma = prisma as any;

  const result = await prisma.$transaction(async (tx) => {
    const anyTx = tx as any;

    const pending = await anyTx.spinChance.findFirst({
      where: { referrerId: userId, claimedAt: null },
      orderBy: { grantedAt: "asc" }
    });
    if (!pending) {
      return { claimed: false as const, reason: "no_chance" as const, rewardCents: 0 };
    }

    const rewardBirr = Math.random() < 0.5 ? 80 : 100;
    const rewardCents = rewardBirr * 100;
    const now = new Date();

    await anyTx.spinChance.update({
      where: { id: pending.id },
      data: { claimedAt: now, rewardCents }
    });

    await tx.user.update({
      where: { id: userId },
      data: { assetsCents: { increment: rewardCents } }
    });

    return { claimed: true as const, reason: "claimed" as const, rewardCents };
  });

  return res.json(result);
});

meRouter.post("/withdraw-password", requireAuth, async (req, res) => {
  const body = z
    .object({
      currentPassword: z.string().optional(),
      password: z.string().min(4),
      confirmPassword: z.string().min(4)
    })
    .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match" })
    .parse(req.body);

  const user = await prisma.user.findUnique({
    where: { id: req.auth!.sub },
    select: { id: true, withdrawPasswordHash: true }
  });
  if (!user) return res.status(404).json({ message: "User not found" });

  if (user.withdrawPasswordHash) {
    if (!body.currentPassword) return res.status(400).json({ message: "Current withdraw password is required" });
    const ok = await verifyPassword(body.currentPassword, user.withdrawPasswordHash);
    if (!ok) return res.status(400).json({ message: "Invalid current withdraw password" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { withdrawPasswordHash: await hashPassword(body.password) }
  });

  return res.json({ ok: true });
});

meRouter.get("/referral-bonuses", requireAuth, async (req, res) => {
  const bonuses = await prisma.referralBonus.findMany({
    where: { referrerId: req.auth!.sub },
    include: {
      referred: { select: { id: true, name: true, email: true } },
      referrer: { select: { id: true, name: true, email: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  
  // Get order details separately
  const bonusesWithOrders = await Promise.all(
    bonuses.map(async (bonus) => {
      const order = await prisma.order.findUnique({
        where: { id: bonus.orderId },
        include: { product: { select: { name: true } } }
      });
      return { ...bonus, order };
    })
  );
  
  return res.json({ bonuses: bonusesWithOrders });
});

meRouter.get("/team", requireAuth, async (req, res) => {
  const teamMembers = await prisma.user.findMany({
    where: { referredById: req.auth!.sub },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      isActive: true,
      balanceCents: true,
      points: true,
      orders: {
        select: {
          id: true,
          status: true,
          amountCents: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json({ teamMembers });
});

meRouter.post("/change-password", requireAuth, async (req, res) => {
  const body = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(4),
      confirmPassword: z.string().min(4)
    })
    .refine((v) => v.newPassword === v.confirmPassword, { message: "Passwords do not match" })
    .parse(req.body);

  const user = await prisma.user.findUnique({
    where: { id: req.auth!.sub },
    select: { id: true, passwordHash: true }
  });
  if (!user) return res.status(404).json({ message: "User not found" });

  const isValidPassword = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!isValidPassword) return res.status(400).json({ message: "Invalid current password" });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) }
  });

  return res.json({ ok: true });
});
