import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const newPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !newPassword) {
    throw new Error("Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD in environment");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    throw new Error("Admin user not found");
  }

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash: await hashPassword(newPassword)
    }
  });

  console.log(`Admin password reset for ${email}`);
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
