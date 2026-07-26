import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type RecruitmentDb = Pick<PrismaClient, "application"> | Pick<Prisma.TransactionClient, "application">;

export type RecruitmentProgress = {
  registered: number;
  arrived: number;
  passed: number;
  onboarded: number;
  remainingGap: number;
  completionRate: number;
};

export async function attachRecruitmentProgress<T extends { id: string; requiredCount: number }>(
  db: RecruitmentDb,
  jobs: T[],
  range?: { start?: Date; end?: Date }
): Promise<Array<T & { progress: RecruitmentProgress }>> {
  return Promise.all(jobs.map(async (job) => {
    const applications = await db.application.findMany({
      where: {
        jobDemandId: job.id,
        appliedAt: range?.start || range?.end ? { gte: range.start, lt: range.end } : undefined
      },
      select: { personId: true, interviewStatus: true, onboardDate: true },
      orderBy: { appliedAt: "desc" }
    });
    const latestByPerson = new Map<string, (typeof applications)[number]>();
    for (const application of applications) {
      if (!latestByPerson.has(application.personId)) latestByPerson.set(application.personId, application);
    }
    const latest = [...latestByPerson.values()];
    const registered = latest.length;
    const arrived = latest.filter((item) => item.interviewStatus === "ARRIVED" || item.interviewStatus === "PASSED").length;
    const passed = latest.filter((item) => item.interviewStatus === "PASSED").length;
    const onboarded = latest.filter((item) => item.onboardDate !== null).length;
    const remainingGap = Math.max(0, job.requiredCount - onboarded);
    const completionRate = job.requiredCount > 0
      ? Number(Math.min(100, (onboarded / job.requiredCount) * 100).toFixed(2))
      : 100;
    return {
      ...job,
      progress: { registered, arrived, passed, onboarded, remainingGap, completionRate }
    };
  }));
}
