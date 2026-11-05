import type { Page, Request, Route } from "@playwright/test";

const branch = { id: "10000000-0000-4000-8000-000000000001", name: "宜宾分公司" };
const project = {
  id: "20000000-0000-4000-8000-000000000001",
  sourceProjectId: "YB-001",
  name: "E2E 核验项目",
  branchId: branch.id,
  branch,
  isExternal: false,
  businessType: "外包",
  status: "ACTIVE",
  managerName: "测试负责人",
  managerPhone: "13800000000",
  cooperationStart: "2026-01-01",
  cooperationEnd: "2026-12-31",
  responsibility: "OURS",
  description: "仅用于自动化验收，不属于生产初始化数据。",
  remark: "E2E fixture",
  images: [],
  statistics: { activeCount: 1, periodOnboard: 1, periodOffboard: 0, interviewCount: 1 }
};
const supplier = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "E2E 测试供应商",
  contactName: "测试联系人",
  contactPhone: "13900000000",
  level: "A级",
  projectLinks: [{ project }],
  statistics: { registered: 1, arrived: 1, passed: 1, onboarded: 1, active: 1, left: 0 }
};
const supplierPolicy = {
  id: "40000000-0000-4000-8000-000000000001",
  name: "E2E 供应商政策",
  type: "SUPPLIER",
  projectId: project.id,
  project,
  supplierLevel: "A级",
  amount: "500.00",
  achievementConditions: "入职并达到测试条件",
  exclusionConditions: null,
  effectiveAt: "2026-01-01",
  expiresAt: "2026-12-31",
  isActive: true
};
const referralPolicy = {
  id: "40000000-0000-4000-8000-000000000002",
  name: "E2E 内部推荐政策",
  type: "EMPLOYEE_REFERRAL",
  projectId: project.id,
  project,
  employeeType: "普通员工",
  amount: "300.00",
  achievementConditions: "入职",
  effectiveAt: "2026-01-01",
  expiresAt: "2026-12-31",
  isActive: true
};

const allPermissions = [
  "dashboard:read", "people:read", "people:write", "people:export", "project:read", "project:write",
  "supplier:read", "supplier:write", "policy:read", "policy:write", "job:read", "job:write",
  "application:create", "referral:create", "reward:review", "salary:manage", "salary:self-read",
  "import:manage", "user:manage", "audit:read"
];

const resourcePermissions = ["project:read", "supplier:read", "supplier:write", "policy:read", "policy:write", "reward:review"];

type MockState = {
  currentUser: Record<string, unknown> | null;
  people: Array<Record<string, any>>;
  jobs: Array<Record<string, any>>;
};

function userFor(username: string) {
  const resource = username === "resource";
  return {
    id: resource ? "90000000-0000-4000-8000-000000000002" : "90000000-0000-4000-8000-000000000001",
    username,
    displayName: resource ? "E2E 资源专员" : "E2E 系统管理员",
    role: resource ? "RESOURCE_SPECIALIST" : "SYSTEM_ADMIN",
    branchId: null,
    supplierId: null,
    personId: null,
    employeeType: null,
    projectIds: [],
    permissions: resource ? resourcePermissions : allPermissions
  };
}

function initialState(): MockState {
  return {
    currentUser: null,
    people: [{
      id: "50000000-0000-4000-8000-000000000001",
      name: "E2E 初始人员",
      idCard: "510101199001011234",
      phone: "13700000000",
      projectId: project.id,
      project,
      jobTitle: "操作员",
      status: "PENDING_ONBOARD",
      interviewStatus: "PASSED",
      interviewDate: "2026-07-18",
      onboardDate: null,
      offboardDate: null,
      insuranceTypes: [],
      supplier,
      supplierPolicy: null,
      notes: "E2E 初始记录",
      files: [],
      statusLogs: [],
      createdAt: "2026-07-18T01:00:00.000Z"
    }],
    jobs: [{
      id: "60000000-0000-4000-8000-000000000001",
      projectId: project.id,
      project,
      title: "E2E 包装操作员",
      requiredCount: 5,
      requirements: "通过自动化测试",
      salary: "5000-6000 元/月",
      workTime: "8:00-17:00",
      workLocation: "测试园区",
      deadline: "2026-12-31T10:00:00.000Z",
      status: "RECRUITING",
      supplierPolicy,
      referralPolicy,
      progress: { registered: 1, arrived: 1, passed: 1, onboarded: 0, remainingGap: 5 }
    }]
  };
}

function pageResult<T>(items: T[]) {
  return { items, pagination: { page: 1, pageSize: 200, total: items.length, totalPages: 1 } };
}

async function body(request: Request): Promise<Record<string, any>> {
  try { return request.postDataJSON() as Record<string, any>; } catch { return {}; }
}

async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(status >= 400 ? data : { data, requestId: "e2e-request" })
  });
}

export async function installMockApi(page: Page): Promise<MockState> {
  const state = initialState();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();

    if (path === "/auth/login" && method === "POST") {
      const input = await body(request);
      if (input.password !== "E2E-Test-Password!") {
        return json(route, { error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" }, requestId: "e2e-request" }, 401);
      }
      state.currentUser = userFor(String(input.username));
      return json(route, { token: `e2e-${input.username}-token`, user: state.currentUser });
    }
    if (path === "/auth/me") return state.currentUser ? json(route, state.currentUser) : json(route, { error: { message: "未登录" } }, 401);

    if (path === "/statistics/overview") return json(route, {
      todayInterviews: 1,
      interviewPassed: 1,
      activePeople: state.people.filter((item) => item.status === "ACTIVE").length,
      todayOnboard: state.people.filter((item) => item.onboardDate === "2026-07-18").length,
      todayOffboard: state.people.filter((item) => item.offboardDate === "2026-07-18").length,
      monthOffboard: state.people.filter((item) => item.offboardDate?.startsWith("2026-07")).length,
      sevenDayTrend: [{ date: "2026-07-18", onboard: 1, offboard: 0 }],
      branchActive: [{ name: branch.name, value: 1 }],
      statusDistribution: [{ name: "在职", value: 1 }],
      projectTop: [{ name: project.name, value: 1 }],
      supplierTop: [{ name: supplier.name, value: 1 }],
      recruitment: { requiredCount: 5, applicationCount: 1, onboardCount: 0, remainingCount: 5 },
      pendingItems: [{ id: "pending", title: "待办理入职", count: 1, level: "warning", path: "/people" }]
    });
    if (path === "/statistics/drilldown") return json(route, pageResult(state.people));

    if (path === "/branches") return json(route, [branch]);
    if (path === "/projects" && method === "GET") return json(route, pageResult([project]));
    if (path === `/projects/${project.id}` && method === "GET") return json(route, project);
    if (path === "/projects" && method === "POST") return json(route, { ...project, ...(await body(request)), id: "20000000-0000-4000-8000-000000000002" }, 201);

    if (path === "/suppliers" && method === "GET") return json(route, pageResult([supplier]));
    if (path === `/suppliers/${supplier.id}`) return json(route, supplier);
    if (path === "/policies" && method === "GET") {
      const type = url.searchParams.get("type");
      return json(route, pageResult(type === "SUPPLIER" ? [supplierPolicy] : type === "EMPLOYEE_REFERRAL" ? [referralPolicy] : [supplierPolicy, referralPolicy]));
    }

    if (path === "/people/export" && method === "GET") {
      return route.fulfill({ status: 200, contentType: "text/csv; charset=utf-8", headers: { "content-disposition": "attachment; filename*=UTF-8''E2E-people.csv" }, body: "姓名,手机号\r\nE2E 初始人员,13700000000" });
    }
    if (path === "/people" && method === "GET") return json(route, pageResult(state.people));
    if (path === "/people" && method === "POST") {
      const input = await body(request);
      const existing = state.people.find((item) => item.idCard === String(input.idCard).toUpperCase());
      const person = existing ?? {
        ...input,
        id: "50000000-0000-4000-8000-000000000002",
        idCard: String(input.idCard).toUpperCase(),
        project,
        status: "APPLICANT",
        interviewStatus: "PENDING_ARRIVAL",
        insuranceTypes: [],
        files: [],
        statusLogs: [],
        createdAt: "2026-07-18T02:00:00.000Z"
      };
      if (!existing) state.people.unshift(person);
      return json(route, { person, application: null, deduplicated: Boolean(existing) }, existing ? 200 : 201);
    }
    const personMatch = path.match(/^\/people\/([^/]+)$/);
    if (personMatch && method === "GET") {
      const person = state.people.find((item) => item.id === personMatch[1]);
      return person ? json(route, person) : json(route, { error: { message: "未找到人员" } }, 404);
    }
    if (personMatch && method === "PATCH") {
      const index = state.people.findIndex((item) => item.id === personMatch[1]);
      if (index < 0) return json(route, { error: { message: "未找到人员" } }, 404);
      const input = await body(request);
      const current = state.people[index]!;
      const next = { ...current, ...input, id: current.id };
      state.people[index] = next;
      return json(route, next);
    }
    const personAction = path.match(/^\/people\/([^/]+)\/(interview|onboard|offboard|notes)$/);
    if (personAction && method === "PATCH") {
      const person = state.people.find((item) => item.id === personAction[1]);
      if (!person) return json(route, { error: { message: "未找到人员" } }, 404);
      const input = await body(request);
      if (personAction[2] === "interview") {
        person.interviewStatus = input.status;
        person.status = input.status === "PASSED" ? "PENDING_ONBOARD" : "INTERVIEWING";
      }
      if (personAction[2] === "onboard") {
        person.onboardDate = String(input.onboardDate).slice(0, 10);
        person.insuranceTypes = input.insuranceTypes ?? [];
        person.employeeNo = input.employeeNo ?? null;
        person.status = "ACTIVE";
      }
      if (personAction[2] === "offboard") {
        person.offboardDate = String(input.offboardDate).slice(0, 10);
        person.offboardReason = input.offboardReason;
        person.status = "LEFT";
      }
      if (personAction[2] === "notes") person.notes = input.notes;
      return json(route, person);
    }

    if (path === "/job-demands" && method === "GET") return json(route, pageResult(state.jobs));
    if (path === "/job-demands" && method === "POST") {
      const input = await body(request);
      const job = { ...input, id: "60000000-0000-4000-8000-000000000002", project, progress: { registered: 0, arrived: 0, passed: 0, onboarded: 0, remainingGap: input.requiredCount } };
      state.jobs.unshift(job);
      return json(route, job, 201);
    }
    const jobMatch = path.match(/^\/job-demands\/([^/]+)$/);
    if (jobMatch) return json(route, state.jobs.find((item) => item.id === jobMatch[1]) ?? state.jobs[0]);
    if (path === "/applications") return json(route, pageResult([]));
    if (path === "/referral-rewards") return json(route, pageResult([]));
    if (path === "/salary-slips") return json(route, pageResult([]));
    if (path === "/imports") return json(route, pageResult([]));
    if (path === "/users") return json(route, pageResult(state.currentUser ? [state.currentUser] : []));
    if (path === "/audit-logs") return json(route, pageResult([]));

    return json(route, { error: { code: "E2E_ROUTE_NOT_MOCKED", message: `未模拟 ${method} ${path}` }, requestId: "e2e-request" }, 404);
  });
  return state;
}
