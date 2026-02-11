import type { Prisma } from "@prisma/client";

const VIP_LEVEL_STEP_INVITES = 5;
const VIP_LEVEL_UP_REWARD_CENTS = 100 * 100;

export function computeVipLevel(qualifiedInviteCount: number): number {
  return 1 + Math.floor(qualifiedInviteCount / VIP_LEVEL_STEP_INVITES);
}

export async function applyVipProgression(tx: Prisma.TransactionClient, userId: string) {
  const qualifiedInvites = await tx.referralBonus.findMany({
    where: { referrerId: userId },
    distinct: ["referredId"],
    select: { referredId: true }
  });

  const qualifiedCount = qualifiedInvites.length;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const currentLevel = (user as any).vipLevel ?? 1;
  const nextLevel = computeVipLevel(qualifiedCount);
  if (nextLevel <= currentLevel) return;

  await tx.user.update({
    where: { id: userId },
    data: { vipLevel: nextLevel } as any
  });

  for (let level = currentLevel + 1; level <= nextLevel; level++) {
    try {
      await (tx as any).vipLevelReward.create({
        data: {
          userId,
          vipLevel: level,
          amountCents: VIP_LEVEL_UP_REWARD_CENTS
        }
      });

      await tx.user.update({
        where: { id: userId },
        data: { balanceCents: { increment: VIP_LEVEL_UP_REWARD_CENTS } }
      });
    } catch {
      // ignore duplicate rewards
    }
  }
}
