function assertInternal(data) {
  if (data?.meta?.internal !== true) {
    throw new Error("真实数据导入只接受 meta.internal=true 的内部数据集");
  }
}

function orderOrganizationUnits(units) {
  const byCode = new Map(units.map((unit) => [unit.code, unit]));
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const output = [];
  const visiting = new Set();
  const visited = new Set();

  function parentOf(unit) {
    if (unit.parentCode) {
      const parent = byCode.get(unit.parentCode);
      if (!parent) throw new Error(`组织 ${unit.name} 找不到上级组织 ${unit.parentCode}`);
      return parent;
    }
    if (unit.parentId) {
      const parent = byId.get(unit.parentId);
      if (!parent) throw new Error(`组织 ${unit.name} 找不到上级组织 ${unit.parentId}`);
      return parent;
    }
    return null;
  }

  function visit(unit) {
    if (visited.has(unit.id)) return;
    if (visiting.has(unit.id)) throw new Error(`组织架构存在循环：${unit.code}`);
    visiting.add(unit.id);
    const parent = parentOf(unit);
    if (parent) visit(parent);
    visiting.delete(unit.id);
    visited.add(unit.id);
    output.push(unit);
  }

  for (const unit of units) visit(unit);
  return { ordered: output, parentOf };
}

export function buildRealImportPlan(data) {
  assertInternal(data);
  const { ordered: orderedUnits, parentOf } = orderOrganizationUnits(data.organizationUnits ?? []);
  const unitByName = new Map(orderedUnits.map((unit) => [unit.name, unit]));
  const pathById = new Map();
  const organizationUnits = orderedUnits.map((unit) => {
    const parent = parentOf(unit);
    const parentPath = parent ? pathById.get(parent.id) : "";
    const path = `${parentPath}/${unit.id}`;
    pathById.set(unit.id, path);
    return { ...unit, parentId: parent?.id ?? null, path };
  });

  const legalByName = new Map((data.legalEntities ?? []).map((item) => [item.name, item]));
  const positionByKey = new Map((data.positions ?? []).map((item) => [`${item.organizationUnitName}|${item.name}`, item]));
  const gradeByName = new Map((data.jobGrades ?? []).map((item) => [item.name, item]));
  const branchIds = new Set((data.branches ?? []).map((item) => item.id));
  const projectIds = new Set((data.projects ?? []).map((item) => item.id));

  for (const project of data.projects ?? []) {
    if (!branchIds.has(project.branchId)) {
      throw new Error(`项目 ${project.name} 找不到真实经营区域 ${project.branchId}`);
    }
  }
  for (const person of data.people ?? []) {
    if (!projectIds.has(person.projectId)) {
      throw new Error(`人员 ${person.name} 找不到真实项目 ${person.projectId}`);
    }
  }
  for (const employee of data.internalEmployees ?? []) {
    if (!unitByName.has(employee.organizationUnitName)) {
      throw new Error(`内部员工 ${employee.name} 找不到真实组织 ${employee.organizationUnitName}`);
    }
    if (employee.legalEntityName && !legalByName.has(employee.legalEntityName)) {
      throw new Error(`内部员工 ${employee.name} 找不到真实合同主体 ${employee.legalEntityName}`);
    }
    if (!positionByKey.has(`${employee.organizationUnitName}|${employee.position}`)) {
      throw new Error(`内部员工 ${employee.name} 找不到真实岗位 ${employee.position}`);
    }
    if (!gradeByName.has(employee.jobGrade)) {
      throw new Error(`内部员工 ${employee.name} 找不到真实职级 ${employee.jobGrade}`);
    }
  }

  return {
    ...data,
    organizationUnits,
    suppliers: data.suppliers ?? [],
    sourceChannels: data.sourceChannels ?? []
  };
}
