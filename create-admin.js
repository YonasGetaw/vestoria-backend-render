import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { customAlphabet } from "nanoid";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const genReferralCode = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8);

async function generateUniqueReferralCode() {
  for (let i = 0; i < 7; i++) {
    const code = genReferralCode();
    const existing = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique referral code");
}

async function main() {
  const email = "yonasgetaw5444@gmail.com";
  const password = "Admin123456";
  const name = "Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: {
        name,
        role: "ADMIN",
        passwordHash: await hashPassword(password),
        referralCode: existing.referralCode ?? (await generateUniqueReferralCode())
      }
    });
    console.log(`Admin password updated for ${email} -> ${password}`);
  } else {
    await prisma.user.create({
      data: {
        name,
        email,
        role: "ADMIN",
        passwordHash: await hashPassword(password),
        referralCode: await generateUniqueReferralCode()
      }
    });
    console.log(`Admin created for ${email} -> ${password}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
