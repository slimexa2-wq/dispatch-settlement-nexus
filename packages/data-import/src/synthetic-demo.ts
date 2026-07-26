type Entity = Record<string, unknown>;

export interface SyntheticDemoValidation {
  valid: boolean;
  counts: Record<string, number>;
  errors: string[];
}

const collections = [
  "branches",
  "projects",
  "suppliers",
  "jobDemands",
  "people",
  "applications",
  "internalEmployees"
] as const;

function asEntityArray(value: unknown): Entity[] {
  return Array.isArray(value)
    ? value.filter((item): item is Entity => typeof item === "object" && item !== null)
    : [];
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

export function validateSyntheticDemoData(input: unknown): SyntheticDemoValidation {
  const root = typeof input === "object" && input !== null ? input as Entity : {};
  const errors: string[] = [];
  const values = Object.fromEntries(
    collections.map((name) => [name, asEntityArray(root[name])])
  ) as Record<(typeof collections)[number], Entity[]>;
  const counts = Object.fromEntries(collections.map((name) => [name, values[name].length]));

  const meta = typeof root.meta === "object" && root.meta !== null ? root.meta as Entity : {};
  if (meta.synthetic !== true) errors.push("meta.synthetic 必须为 true");
  if (!nonEmpty(meta.schemaVersion)) errors.push("meta.schemaVersion 不能为空");

  for (const name of collections) {
    if (values[name].length === 0) errors.push(`${name} 必须至少包含一条演示数据`);
    const ids = values[name].map((item) => item.id).filter(nonEmpty).map(String);
    if (ids.length !== values[name].length) errors.push(`${name} 存在缺失 id 的记录`);
    if (new Set(ids).size !== ids.length) errors.push(`${name} 存在重复 id`);
  }

  const requiredFields: Partial<Record<(typeof collections)[number], string[]>> = {
    branches: ["name"],
    projects: ["branchId", "name", "managerName", "managerPhone", "imageUrl"],
    suppliers: ["name", "contactName", "contactPhone"],
    jobDemands: [
      "projectId", "title", "requiredCount", "description", "requirements",
      "salary", "workTime", "workLocation"
    ],
    people: [
      "employeeNo", "name", "phone", "idCard", "branchId", "projectId",
      "supplierId", "employmentStatus"
    ],
    applications: ["personId", "jobDemandId"],
    internalEmployees: ["employeeNo", "name", "phone", "idCard", "branchId"]
  };

  for (const name of collections) {
    values[name].forEach((item, index) => {
      for (const field of requiredFields[name] ?? []) {
        if (!nonEmpty(item[field])) errors.push(`${name}[${index}].${field} 不能为空`);
      }
    });
  }

  const ids = {
    branch: new Set(values.branches.map((item) => String(item.id))),
    project: new Set(values.projects.map((item) => String(item.id))),
    supplier: new Set(values.suppliers.map((item) => String(item.id))),
    person: new Set(values.people.map((item) => String(item.id))),
    job: new Set(values.jobDemands.map((item) => String(item.id)))
  };

  const requireReference = (
    collection: keyof typeof values,
    field: string,
    targetLabel: string,
    targetIds: Set<string>
  ) => {
    values[collection].forEach((item, index) => {
      const reference = String(item[field] ?? "");
      if (reference && !targetIds.has(reference)) {
        errors.push(`${collection}[${index}].${field} 引用了不存在的${targetLabel} ${reference}`);
      }
    });
  };

  requireReference("projects", "branchId", "分公司", ids.branch);
  requireReference("jobDemands", "projectId", "项目", ids.project);
  requireReference("people", "branchId", "分公司", ids.branch);
  requireReference("people", "projectId", "项目", ids.project);
  requireReference("people", "supplierId", "供应商", ids.supplier);
  requireReference("internalEmployees", "branchId", "分公司", ids.branch);
  requireReference("applications", "personId", "人员", ids.person);
  requireReference("applications", "jobDemandId", "岗位需求", ids.job);

  values.suppliers.forEach((supplier, index) => {
    const projectIds = Array.isArray(supplier.projectIds) ? supplier.projectIds.map(String) : [];
    if (projectIds.length === 0) errors.push(`suppliers[${index}].projectIds 不能为空`);
    for (const projectId of projectIds) {
      if (!ids.project.has(projectId)) {
        errors.push(`suppliers[${index}].projectIds 引用了不存在的项目 ${projectId}`);
      }
    }
  });

  return { valid: errors.length === 0, counts, errors };
}
