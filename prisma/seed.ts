import { hash } from "bcryptjs";
import {
  PrismaClient,
  UserRole
} from "../apps/api/src/generated/prisma/client.js";

await import("../scripts/import-demo-data.mjs");

const username = process.env.SEED_ADMIN_USERNAME;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!username || !password) {
  console.log("synthetic_demo_seeded=true admin_seeded=false");
} else {
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters");
  }
  const prisma = new PrismaClient();
  try {
    await prisma.user.upsert({
      where: { username },
      update: {
        passwordHash: await hash(password, 12),
        displayName: process.env.SEED_ADMIN_DISPLAY_NAME ?? "系统管理员",
        isActive: true,
        tokenVersion: { increment: 1 }
      },
      create: {
        username,
        passwordHash: await hash(password, 12),
        displayName: process.env.SEED_ADMIN_DISPLAY_NAME ?? "系统管理员",
        role: UserRole.SYSTEM_ADMIN
      }
    });
    console.log(`synthetic_demo_seeded=true admin_seeded=true username=${username}`);
  } finally {
    await prisma.$disconnect();
  }
}

