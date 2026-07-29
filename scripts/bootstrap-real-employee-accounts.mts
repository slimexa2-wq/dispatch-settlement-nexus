import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import { PrismaClient, UserRole } from "../apps/api/src/generated/prisma/client.js";
import { loadBusinessData } from "./lib/business-data-source.mjs";
import { assertInternalDatabaseUrl } from "./lib/internal-startup-contract.mjs";

type RealEmployee = {
  employeeNo: string;
  sourceEmployeeNo?: string | null;
  name: string;
  phone: string;
  idCard: string;
  status: "ACTIVE" | "INACTIVE" | "LEFT";
};

type CredentialRow = {
  employeeNo: string;
  sourceEmployeeNo: string | null;
  name: string;
  phone: string;
  username: string;
  initialPassword: string;
  createdAt: string;
};

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;
assertInternalDatabaseUrl(databaseUrl);
const outputPath = resolve(
  workspaceRoot,
  process.env.XIANGNENG_EMPLOYEE_ACCOUNT_FILE || "data/internal/internal-employee-initial-accounts.json"
);
const { data } = await loadBusinessData({ root: workspaceRoot, mode: "internal" });
const employees = (data.internalEmployees ?? []) as RealEmployee[];
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

async function existingCredentials(): Promise<CredentialRow[]> {
  try {
    const parsed = JSON.parse(await readFile(outputPath, "utf8"));
    return Array.isArray(parsed.accounts) ? parsed.accounts : [];
  } catch {
    return [];
  }
}

const knownCredentials = await existingCredentials();
const credentialsByEmployeeNo = new Map(knownCredentials.map((row) => [row.employeeNo, row]));
let createdCount = 0;
let linkedCount = 0;
let skippedCount = 0;

try {
  for (const source of employees) {
    if (source.status !== "ACTIVE") {
      skippedCount += 1;
      continue;
    }
    const employee = await prisma.internalEmployee.findUnique({
      where: { idCard: source.idCard },
      select: { id: true, userId: true, employeeNo: true, name: true, phone: true }
    });
    if (!employee) {
      throw new Error(`真实员工 ${source.employeeNo} 尚未导入内部员工表`);
    }
    if (employee.userId) {
      skippedCount += 1;
      continue;
    }

    const username = employee.employeeNo.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      const occupied = await prisma.internalEmployee.findFirst({
        where: { userId: existingUser.id, id: { not: employee.id } },
        select: { id: true }
      });
      if (occupied) {
        throw new Error(`账号 ${username} 已绑定其他内部员工，拒绝自动覆盖`);
      }
      await prisma.internalEmployee.update({
        where: { id: employee.id },
        data: { userId: existingUser.id }
      });
      linkedCount += 1;
      continue;
    }

    const initialPassword = randomBytes(15).toString("base64url");
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hash(initialPassword, 12),
        displayName: employee.name,
        role: UserRole.EMPLOYEE,
        employeeType: "内部员工",
        isActive: true
      }
    });
    await prisma.internalEmployee.update({
      where: { id: employee.id },
      data: { userId: user.id }
    });
    credentialsByEmployeeNo.set(employee.employeeNo, {
      employeeNo: employee.employeeNo,
      sourceEmployeeNo: source.sourceEmployeeNo ?? null,
      name: employee.name,
      phone: employee.phone,
      username,
      initialPassword,
      createdAt: new Date().toISOString()
    });
    createdCount += 1;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    warning: "内部敏感文件，仅用于首次分发账号。请妥善保管并在账号交付后删除。",
    accounts: [...credentialsByEmployeeNo.values()].sort((left, right) =>
      left.employeeNo.localeCompare(right.employeeNo, "zh-CN")
    )
  }, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: "ok",
    createdCount,
    linkedCount,
    skippedCount,
    credentialFile: outputPath
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
