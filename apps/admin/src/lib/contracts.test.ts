import { describe, expect, it } from "vitest";
import { adaptJobDemand, adaptProject } from "./adapters";
import { peopleFiltersFromSearchParams, peopleListEndpoint, registrationResultMessage } from "./people";
import { metricPeoplePath, normalizeStatistics, statPointPeoplePath } from "./statistics";
import { importWarnings, stagedImportCommit } from "./imports";
import { EmploymentStatus, JobStatus } from "@xiangneng/shared";
import { Permission } from "@xiangneng/shared";
import { homePathForPermissions } from "../routes/home";
import { toDateValue } from "./format";
import { applicationInterviewEndpoint } from "./applications";

describe("API contract adapters", () => {
  it("将数据库日期字段序列化为本地日历日，避免时区换算造成日期前移", () => {
    expect(toDateValue("2026-07-18T00:00:00+08:00")).toBe("2026-07-18");
    expect(toDateValue("not-a-date")).toBeUndefined();
  });

  it("招聘进度状态更新按报名 ID 精确定位，不回退到人员最新报名", () => {
    expect(applicationInterviewEndpoint("application-1")).toBe("/applications/application-1/interview");
  });

  it("将后端统计响应映射为首页字段，不用静默的零值掩盖契约", () => {
    const result = normalizeStatistics({
      cards: {
        todayInterview: 5,
        interviewPassed: 8,
        active: 120,
        todayOnboard: 3,
        todayOffboard: 1,
        monthOffboard: 9
      },
      trend: [{ date: "2026-07-18", onboarded: 3, offboarded: 1 }],
      branchActive: [{ branchId: "branch-1", name: "某分公司", count: 120 }],
      statusDistribution: [{ status: EmploymentStatus.ACTIVE, count: 120 }],
      projectTop5: [{ projectId: "project-1", name: "某项目", count: 60 }],
      supplierTop5: [{ supplierId: "supplier-1", name: "某供应商", count: 20 }],
      recruitment: { required: 50, applications: 42, onboarded: 30, remainingGap: 20 },
      pendingItems: [{ key: "pending-onboard", title: "待入职", count: 2, severity: "warning", metric: "interviewPassed" }],
      anomalies: [{ id: "active-without-onboard", type: "在职人员缺少入职日期", scopeName: "当前项目", expected: 0, actual: 2, difference: 2, personIds: ["person-1", "person-2"] }]
    });

    expect(result.todayInterviews).toBe(5);
    expect(result.activePeople).toBe(120);
    expect(result.sevenDayTrend).toEqual([{ date: "2026-07-18", onboard: 3, offboard: 1 }]);
    expect(result.branchActive).toEqual([{ name: "某分公司", value: 120, branchId: "branch-1", projectId: undefined, supplierId: undefined, status: undefined }]);
    expect(result.statusDistribution).toEqual([{ name: "在职", value: 120, branchId: undefined, projectId: undefined, supplierId: undefined, status: EmploymentStatus.ACTIVE }]);
    expect(result.recruitment).toEqual({ requiredCount: 50, applicationCount: 42, onboardCount: 30, remainingCount: 20 });
    expect(result.pendingItems?.[0]).toMatchObject({ id: "pending-onboard", level: "warning", path: "/people?metric=interviewPassed" });
    expect(result.anomalies).toEqual([{ id: "active-without-onboard", type: "在职人员缺少入职日期", scopeName: "当前项目", expected: 0, actual: 2, difference: 2, personIds: ["person-1", "person-2"] }]);
  });

  it("统计维度生成可回到对应人员名单的下钻路径", () => {
    expect(statPointPeoplePath({ name: "分公司", value: 3, branchId: "branch/1" })).toBe("/people?branchId=branch%2F1");
    expect(statPointPeoplePath({ name: "项目", value: 2, projectId: "project-1" })).toBe("/people?projectId=project-1");
    expect(statPointPeoplePath({ name: "供应商", value: 1, supplierId: "supplier-1" })).toBe("/people?supplierId=supplier-1");
    expect(statPointPeoplePath({ name: "在职", value: 8, status: EmploymentStatus.ACTIVE })).toBe(`/people?status=${EmploymentStatus.ACTIVE}`);
    expect(peopleFiltersFromSearchParams(new URLSearchParams("branchId=branch-1"))).toMatchObject({ branchId: "branch-1" });
    expect(peopleFiltersFromSearchParams(new URLSearchParams("anomalyId=active-without-onboard"))).toMatchObject({ anomalyId: "active-without-onboard" });
    expect(metricPeoplePath("interviewPassed", { from: "2026-07-01", to: "2026-07-18" })).toBe("/people?metric=interviewPassed&from=2026-07-01&to=2026-07-18");
  });

  it("展开项目与招聘进度的嵌套统计", () => {
    const project = adaptProject({
      id: "project-1",
      branchId: "branch-1",
      name: "项目",
      isExternal: false,
      statistics: { activeCount: 10, periodOnboard: 4, periodOffboard: 2, interviewCount: 7 }
    });
    expect(project.activeCount).toBe(10);

    const demand = adaptJobDemand({
      id: "job-1",
      projectId: "project-1",
      title: "岗位",
      requiredCount: 20,
      requirements: "要求",
      salary: "面议",
      workTime: "白班",
      workLocation: "项目地",
      deadline: "2026-08-01",
      status: JobStatus.RECRUITING,
      progress: { registered: 12, arrived: 8, passed: 6, onboarded: 5, remainingGap: 15 }
    });
    expect(demand.applicationCount).toBe(12);
    expect(demand.remainingCount).toBe(15);
  });

  it("身份证命中原档时明确提示归并", () => {
    const message = registrationResultMessage({
      deduplicated: true,
      person: {
        id: "person-1",
        name: "测试人员",
        idCard: "510000000000000000",
        phone: "13800000000",
        projectId: "project-1",
        jobTitle: "岗位",
        employmentStatus: EmploymentStatus.APPLICANT,
        insuranceTypes: [],
        createdAt: "2026-07-18"
      }
    });
    expect(message).toContain("原档案");
    expect(message).toContain("已归并");
  });

  it("工资条预览未返回 warnings 时安全解包为空数组", () => {
    expect(importWarnings({})).toEqual([]);
  });

  it("组织、人员等分阶段导入提交同时绑定预览 ID 与源文件摘要", () => {
    expect(stagedImportCommit("import-1", "source-hash")).toEqual({
      importId: "import-1",
      sourceHash: "source-hash"
    });
  });

  it("首页指标下钻使用专用统计明细接口", () => {
    expect(peopleListEndpoint("active")).toBe("/statistics/drilldown");
    expect(peopleListEndpoint()).toBe("/people");
  });

  it("没有首页权限时进入首个可用管理模块", () => {
    expect(homePathForPermissions([Permission.PROJECT_READ, Permission.SUPPLIER_READ])).toBe("/projects");
    expect(homePathForPermissions([Permission.REWARD_REVIEW])).toBe("/recruitment/rewards");
  });
});
