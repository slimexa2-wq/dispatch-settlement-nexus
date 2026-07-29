import { hash } from "bcryptjs";
import { PrismaClient, UserRole } from "../apps/api/src/generated/prisma/client.js";
import {
  assertInternalDatabaseUrl,
  validateBootstrapCredentials
} from "./lib/internal-startup-contract.mjs";

const databaseUrl = process.env.DATABASE_URL;
assertInternalDatabaseUrl(databaseUrl);
const credentials = validateBootstrapCredentials({
  username: process.env.XIANGNENG_BOOTSTRAP_ADMIN_USERNAME,
  password: process.env.XIANGNENG_BOOTSTRAP_ADMIN_PASSWORD
});
const displayName = process.env.XIANGNENG_BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || "祥能系统管理员";
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

try {
  await prisma.user.upsert({
    where: { username: credentials.username },
    create: {
      username: credentials.username,
      passwordHash: await hash(credentials.password, 12),
      displayName,
      role: UserRole.SYSTEM_ADMIN,
      employeeType: "内部管理员",
      isActive: true
    },
    update: {
      passwordHash: await hash(credentials.password, 12),
      displayName,
      role: UserRole.SYSTEM_ADMIN,
      employeeType: "内部管理员",
      isActive: true,
      tokenVersion: { increment: 1 }
    }
  });
  console.log(JSON.stringify({ status: "ok", username: credentials.username, displayName }));
} finally {
  await prisma.$disconnect();
}
