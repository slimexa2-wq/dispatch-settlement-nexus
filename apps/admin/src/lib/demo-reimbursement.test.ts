import { beforeEach, describe, expect, it } from "vitest";
import type {
  InternalEmployee,
  LeadershipDashboard,
  ListResult,
  Reimbursement,
  ReimbursementArtifact,
  ReimbursementStatus
} from "../types/domain";
import { handleDemoRequest } from "./demo";

describe("断网演示业务层", () => {
  beforeEach(async () => {
    await handleDemoRequest("POST", "/demo/reset", {}, {});
  });

  it("内部员工和领导看板均使用完整合成数据", async () => {
    const employees = await handleDemoRequest<ListResult<InternalEmployee>>(
      "GET",
      "/internal-employees",
      { page: 1, pageSize: 20 }
    );
    const dashboard = await handleDemoRequest<LeadershipDashboard>(
      "GET",
      "/leadership/dashboard"
    );

    expect(employees.items.length).toBeGreaterThanOrEqual(6);
    expect(employees.items[0]?.phone).toMatch(/^138\d{8}$/);
    expect(employees.items[0]?.idCard).toHaveLength(18);
    expect(dashboard.people.totalActive).toBeGreaterThan(0);
    expect(dashboard.reimbursements.count).toBe(7);
  });

  it("内部员工新增、调动和离职会真实更新档案与版本", async () => {
    let employee = await handleDemoRequest<InternalEmployee>(
      "POST",
      "/internal-employees",
      {},
      {
        employeeNo: "XN-DEMO-0099",
        name: "演示新增员工",
        phone: "13800001999",
        idCard: "510105199901019999",
        email: "new-employee@xiangneng.example",
        legalEntityId: "demo-legal-1",
        branchId: "synthetic-branch-01",
        organizationUnitId: "demo-org-hr",
        positionId: "demo-position-hr",
        jobGradeId: "demo-grade-5",
        onboardDate: "2026-07-26",
        reason: "大赛演示入职"
      }
    );
    expect(employee.status).toBe("ACTIVE");
    expect(employee.version).toBe(1);
    expect(employee.changes?.at(-1)?.type).toBe("ONBOARD");

    employee = await handleDemoRequest<InternalEmployee>(
      "POST",
      `/internal-employees/${employee.id}/transfer`,
      {},
      {
        expectedVersion: employee.version,
        effectiveDate: "2026-08-01",
        branchId: "synthetic-branch-02",
        organizationUnitId: "demo-org-ops",
        positionId: "demo-position-ops",
        reason: "转入运营管理部"
      }
    );
    expect(employee.version).toBe(2);
    expect(employee.organizationUnit?.name).toBe("运营管理部");
    expect(employee.changes?.at(-1)?.type).toBe("TRANSFER");

    employee = await handleDemoRequest<InternalEmployee>(
      "POST",
      `/internal-employees/${employee.id}/offboard`,
      {},
      {
        expectedVersion: employee.version,
        offboardDate: "2026-08-31",
        reason: "个人发展"
      }
    );
    expect(employee.status).toBe("LEFT");
    expect(employee.version).toBe(3);
    expect(employee.offboardReason).toBe("个人发展");
    expect(employee.changes?.at(-1)?.type).toBe("OFFBOARD");
  });

  it("可从创建报销单连续流转到打款并生成材料", async () => {
    let batch = await handleDemoRequest<Reimbursement>(
      "POST",
      "/reimbursements",
      {},
      {
        title: "断网演示差旅报销",
        branchId: "synthetic-branch-01",
        organizationUnitId: "demo-org-ops",
        lines: [{
          sequence: 1,
          expenseDate: "2026-07-26",
          category: "差旅费",
          description: "比赛演示项目巡检",
          paymentCents: 1_000_00,
          invoiceCents: 1_020_00
        }]
      }
    );
    const targets: ReimbursementStatus[] = [
      "DEPARTMENT_PREPARING",
      "OWNER_REVIEWING",
      "FINANCE_REVIEWING",
      "APPROVED",
      "PENDING_PAYMENT"
    ];
    for (const targetStatus of targets) {
      batch = await handleDemoRequest<Reimbursement>(
        "POST",
        `/reimbursements/${batch.id}/transition`,
        {},
        {
          expectedVersion: batch.version,
          targetStatus,
          comment: "自动化演示流转"
        }
      );
    }

    const artifact = await handleDemoRequest<ReimbursementArtifact>(
      "POST",
      `/reimbursements/${batch.id}/artifacts/generate`,
      {},
      { type: "REIMBURSEMENT_FORM" }
    );
    await handleDemoRequest(
      "POST",
      `/reimbursements/${batch.id}/payments`,
      {},
      {
        expectedVersion: batch.version,
        amountCents: batch.totalPaymentCents,
        reference: "DEMO-OFFLINE-001",
        paidAt: "2026-07-26T16:00:00.000Z"
      }
    );
    const completed = await handleDemoRequest<Reimbursement>(
      "GET",
      `/reimbursements/${batch.id}`
    );

    expect(artifact.status).toBe("GENERATED");
    expect(completed.status).toBe("PAID");
    expect(completed.payment?.reference).toBe("DEMO-OFFLINE-001");
  });
});
