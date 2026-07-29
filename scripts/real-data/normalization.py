from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import re
from typing import Any, Iterable


def stable_id(prefix: str, *parts: object) -> str:
    raw = "|".join("" if part is None else str(part).strip() for part in parts)
    return f"{prefix}-{sha256(raw.encode('utf-8')).hexdigest()[:16]}"


ORG_ALIASES = {
    "运营中心": "MOC运营中心",
    "MOC运营中心": "MOC运营中心",
    "保安子公司": "祥能保安公司",
    "祥能保安公司": "祥能保安公司",
    "宜宾分公司运营部": "宜宾分公司",
    "绵阳分公司运营部": "绵阳分公司",
    "双流分公司运营部": "双流分公司",
    "龙泉分公司运营部": "龙泉分公司",
    "郫都分公司运营部": "郫都分公司",
    "重庆分公司运营部": "重庆分公司",
    "广元分公司运营部": "广元分公司",
}


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def canonical_org_name(value: Any) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    return ORG_ALIASES.get(text, text)


def is_project_summary(name: Any) -> bool:
    text = clean_text(name) or ""
    if not text:
        return True
    if text in {"合计", "总计"}:
        return True
    return bool(re.fullmatch(r"\d+个项目(?:、\d+个外送)?", text))


def project_match_key(name: Any) -> str:
    text = clean_text(name) or ""
    text = re.sub(r"[（(][^）)]*[）)]", "", text)
    text = text.replace("岗位外包项目", "")
    text = re.sub(r"(项目|联合派遣|外包|派遣|代招)$", "", text)
    text = re.sub(r"[\s\-—_/·（）()]+", "", text)
    return text


def normalize_interview_result(result: Any, onboard_date: Any, offboard_date: Any) -> dict[str, str]:
    result_text = clean_text(result) or ""
    has_onboard = bool(clean_text(onboard_date))
    has_offboard = bool(clean_text(offboard_date))
    if has_offboard or result_text == "已离职":
        return {"interviewStatus": "PASSED", "employmentStatus": "LEFT", "status": "LEFT"}
    if has_onboard or result_text == "已入职":
        return {"interviewStatus": "PASSED", "employmentStatus": "ACTIVE", "status": "ACTIVE"}
    if result_text in {"面试通过", "未入职", "已签约", "新进未报到"}:
        return {"interviewStatus": "PASSED", "employmentStatus": "PENDING_ONBOARD", "status": "PENDING_ONBOARD"}
    if result_text == "已到场":
        return {"interviewStatus": "ARRIVED", "employmentStatus": "INTERVIEWING", "status": "INTERVIEWING"}
    if result_text == "面试未通过":
        return {"interviewStatus": "FAILED", "employmentStatus": "APPLICANT", "status": "APPLICANT"}
    if result_text == "中途放弃":
        return {"interviewStatus": "ABANDONED", "employmentStatus": "APPLICANT", "status": "APPLICANT"}
    return {"interviewStatus": "PENDING_ARRIVAL", "employmentStatus": "APPLICANT", "status": "APPLICANT"}


def source_application_type(source: Any, recommender: Any) -> str:
    source_text = clean_text(source) or ""
    if source_text == "祥能自招":
        return "REFERRAL" if clean_text(recommender) else "SELF"
    return "SUPPLIER" if source_text else "SELF"


def organization_blueprint() -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    def add(code: str, name: str, type_: str, parent: str | None, order: int) -> None:
        nodes.append({
            "id": stable_id("org", code),
            "code": code,
            "name": name,
            "type": type_,
            "parentCode": parent,
            "sortOrder": order,
            "isActive": True,
        })

    add("XN-GROUP", "四川祥能人力资本服务有限公司", "GROUP", None, 1)
    add("XN-LEADERSHIP", "集团领导", "LEADERSHIP", "XN-GROUP", 1)
    add("XN-CENTER-MANAGEMENT", "管理中心", "CENTER", "XN-GROUP", 2)
    add("XN-CENTER-RESOURCE", "资源中心", "CENTER", "XN-GROUP", 3)
    add("XN-CENTER-MARKET", "市场中心", "CENTER", "XN-GROUP", 4)
    add("XN-CENTER-MOC", "MOC运营中心", "CENTER", "XN-GROUP", 5)

    for order, (code, name) in enumerate([
        ("XN-DEPT-HR", "人力资源部"),
        ("XN-DEPT-PUBLIC", "公共事务部"),
        ("XN-DEPT-FINANCE", "财务规划部"),
    ], 1):
        add(code, name, "DEPARTMENT", "XN-CENTER-MANAGEMENT", order)

    for order, (code, name) in enumerate([
        ("XN-DEPT-ENTERPRISE", "企事业部"),
        ("XN-DEPT-MARKET", "市场拓展部"),
        ("XN-DEPT-GM", "总经办"),
    ], 1):
        add(code, name, "BUSINESS_DEPARTMENT", "XN-CENTER-MARKET", order)

    for order, (code, name, type_) in enumerate([
        ("XN-BRANCH-SHUANGLIU", "双流分公司", "BRANCH"),
        ("XN-BRANCH-PIDU", "郫都分公司", "BRANCH"),
        ("XN-BRANCH-YIBIN", "宜宾分公司", "BRANCH"),
        ("XN-BRANCH-MIANYANG", "绵阳分公司", "BRANCH"),
        ("XN-SUBSIDIARY-SECURITY", "祥能保安公司", "SUBSIDIARY"),
        ("XN-BRANCH-LONGQUAN", "龙泉分公司", "BRANCH"),
        ("XN-BRANCH-GUANGYUAN", "广元分公司", "BRANCH"),
        ("XN-BRANCH-CHONGQING", "重庆分公司", "BRANCH"),
    ], 1):
        add(code, name, type_, "XN-CENTER-MOC", order)

    by_code = {node["code"]: node for node in nodes}

    def resolve_path(node: dict[str, Any]) -> str:
        cached = node.get("path")
        if cached:
            return cached
        parent_code = node.get("parentCode")
        if not parent_code:
            path = f"/{node['id']}"
        else:
            parent = by_code[parent_code]
            path = f"{resolve_path(parent)}/{node['id']}"
        node["path"] = path
        return path

    for node in nodes:
        resolve_path(node)
    for node in nodes:
        parent_code = node.pop("parentCode")
        node["parentId"] = by_code[parent_code]["id"] if parent_code else None
    return nodes


def _to_int(value: Any) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _date_sort_value(value: Any) -> str:
    text = clean_text(value)
    return text or "0000-00-00"


def _project_branch_from_enterprise(rows: list[dict[str, Any]]) -> str | None:
    counts: Counter[str] = Counter()
    for row in rows:
        org = canonical_org_name(row.get("所属部门"))
        if org in {
            "宜宾分公司", "绵阳分公司", "双流分公司", "龙泉分公司",
            "郫都分公司", "重庆分公司", "广元分公司", "祥能保安公司"
        }:
            counts[org] += 1
    return counts.most_common(1)[0][0] if counts else None


def _normalize_employee_no(value: Any, id_card: str, index: int) -> str:
    text = clean_text(value)
    if text:
        return text
    return f"XN-{sha256((id_card or str(index)).encode('utf-8')).hexdigest()[:10].upper()}"


def normalize_real_business_data(
    weekly_rows: list[dict[str, Any]],
    enterprise_rows: list[dict[str, Any]],
    roster_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    blueprint = organization_blueprint()
    blueprint_names = {node["name"] for node in blueprint}

    project_records: list[dict[str, Any]] = []
    project_by_name: dict[str, dict[str, Any]] = {}
    branch_names: set[str] = set()

    for row in weekly_rows:
        region = canonical_org_name(row.get("区域"))
        project_name = clean_text(row.get("项目名称"))
        if not project_name or not region or region == "合计" or is_project_summary(project_name):
            continue
        branch_names.add(region)
        project = {
            "id": stable_id("project", region, project_name),
            "sourceProjectId": stable_id("source-project", region, project_name),
            "branchId": stable_id("branch", region),
            "branchName": region,
            "name": project_name,
            "isExternal": "外送" in project_name,
            "businessType": clean_text(row.get("业务类型")),
            "status": "ACTIVE" if _to_int(row.get("7月19日在职合计")) > 0 else "HISTORICAL",
            "managerName": None,
            "managerPhone": None,
            "cooperationStart": None,
            "cooperationEnd": None,
            "responsibility": "PENDING_CONFIRMATION",
            "remark": clean_text(row.get("原因说明")),
            "weeklySnapshot": {
                "selfRecruited": _to_int(row.get("7月19日自招")),
                "supplierRecruited": _to_int(row.get("7月19日供应商")),
                "active": _to_int(row.get("7月19日在职合计")),
                "onboarded": _to_int(row.get("本期入职")),
                "offboarded": _to_int(row.get("本期离职")),
                "change": _to_int(row.get("环比变化")),
                "reason": clean_text(row.get("原因说明")),
            },
        }
        project_records.append(project)
        project_by_name[project_name] = project

    enterprise_by_project: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in enterprise_rows:
        name = clean_text(row.get("面试企业"))
        if name:
            enterprise_by_project[name].append(row)

    project_key_index: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for project in project_records:
        project_key_index[project_match_key(project["name"])].append(project)

    project_mapping: dict[str, dict[str, Any]] = {}
    for source_name, rows in enterprise_by_project.items():
        exact = project_by_name.get(source_name)
        if exact:
            project_mapping[source_name] = exact
            continue
        candidates = project_key_index.get(project_match_key(source_name), [])
        if len(candidates) == 1:
            project_mapping[source_name] = candidates[0]
            continue
        branch = _project_branch_from_enterprise(rows)
        if not branch:
            continue
        branch_names.add(branch)
        created = {
            "id": stable_id("project", branch, source_name),
            "sourceProjectId": stable_id("source-project", branch, source_name),
            "branchId": stable_id("branch", branch),
            "branchName": branch,
            "name": source_name,
            "isExternal": "外送" in source_name,
            "businessType": None,
            "status": "PENDING_CONFIRMATION",
            "managerName": None,
            "managerPhone": None,
            "cooperationStart": None,
            "cooperationEnd": None,
            "responsibility": "PENDING_CONFIRMATION",
            "remark": "项目来自企业人员名单，周度项目表未找到唯一匹配，归属按源表所属部门建立。",
            "weeklySnapshot": None,
        }
        project_records.append(created)
        project_mapping[source_name] = created
        project_key_index[project_match_key(source_name)].append(created)

    branches = [
        {
            "id": stable_id("branch", name),
            "sourceCode": stable_id("branch-code", name).upper(),
            "name": name,
            "remark": "经营区域/项目归属，来源于真实周度在离职数据或人员所属部门。",
        }
        for name in sorted(branch_names)
    ]

    people_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    applications: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []

    for index, row in enumerate(enterprise_rows, 1):
        id_card = clean_text(row.get("身份证"))
        phone = clean_text(row.get("电话"))
        name = clean_text(row.get("姓名")) or f"源表第{index}行"
        person_key = id_card or phone or f"{name}|{index}"
        project_name = clean_text(row.get("面试企业"))
        project = project_mapping.get(project_name or "")
        if not project:
            unresolved.append({
                "row": index + 1,
                "name": name,
                "projectName": project_name,
                "department": clean_text(row.get("所属部门")),
                "reason": "无法从周度项目或所属部门确认项目归属",
            })
            continue
        status = normalize_interview_result(row.get("面试结果"), row.get("入职日期"), row.get("离职日期"))
        person_id = stable_id("person", person_key)
        application_id = stable_id("application", index, person_key, project["id"])
        job_id = stable_id("historical-job", project["id"])
        application = {
            "id": application_id,
            "personId": person_id,
            "jobDemandId": job_id,
            "projectId": project["id"],
            "projectName": project["name"],
            "source": source_application_type(row.get("供应商"), row.get("推荐人")),
            "sourceChannelName": clean_text(row.get("供应商")),
            "supplierId": None,
            "recommenderName": clean_text(row.get("推荐人")),
            "interviewStatus": status["interviewStatus"],
            "interviewDate": clean_text(row.get("面试日期")),
            "employmentStatus": status["employmentStatus"],
            "onboardDate": clean_text(row.get("入职日期")),
            "offboardDate": clean_text(row.get("离职日期")),
            "offboardReason": None,
            "appliedAt": (clean_text(row.get("面试日期")) or "2026-01-01") + "T09:00:00.000Z",
            "supplierPolicyText": clean_text(row.get("供应商政策")),
            "employeePolicyText": clean_text(row.get("员工政策")),
            "settlementPolicyText": clean_text(row.get("结费政策")),
            "sourceDepartment": clean_text(row.get("所属部门")),
            "sourceInterviewResult": clean_text(row.get("面试结果")),
        }
        applications.append(application)
        person_row = {
            "id": person_id,
            "sourceRow": index + 1,
            "employeeNo": stable_id("employee", person_key).upper(),
            "name": name,
            "idCard": id_card,
            "phone": phone,
            "gender": clean_text(row.get("性别")),
            "age": _to_int(row.get("年龄")) or None,
            "ethnicity": clean_text(row.get("民族")),
            "origin": None,
            "branchId": project["branchId"],
            "branchName": project["branchName"],
            "projectId": project["id"],
            "projectName": project["name"],
            "jobTitle": clean_text(row.get("面试部门")) or "项目人员",
            "interviewDate": application["interviewDate"],
            "interviewStatus": status["interviewStatus"],
            "employmentStatus": status["employmentStatus"],
            "status": status["status"],
            "onboardDate": application["onboardDate"],
            "offboardDate": application["offboardDate"],
            "offboardReason": None,
            "insuranceTypes": [],
            "supplierId": None,
            "supplierName": clean_text(row.get("供应商")),
            "supplierPolicyText": application["supplierPolicyText"],
            "employeePolicyText": application["employeePolicyText"],
            "settlementPolicyText": application["settlementPolicyText"],
            "recommenderName": application["recommenderName"],
            "emergencyContactName": clean_text(row.get("紧急联系人")),
            "emergencyContactPhone": clean_text(row.get("紧急联系人电话")),
            "emergencyContactRelation": None,
            "source": application["source"],
            "notes": None,
            "files": [],
            "statusLogs": [{
                "id": stable_id("status-log", application_id),
                "fromStatus": None,
                "toStatus": status["status"],
                "notes": f"导入源状态：{clean_text(row.get('面试结果')) or '未填写'}",
                "createdAt": application["appliedAt"],
            }],
            "createdAt": application["appliedAt"],
            "updatedAt": application["appliedAt"],
        }
        people_groups[person_key].append(person_row)

    people: list[dict[str, Any]] = []
    for group in people_groups.values():
        latest = sorted(
            group,
            key=lambda item: (
                _date_sort_value(item.get("offboardDate")),
                _date_sort_value(item.get("onboardDate")),
                _date_sort_value(item.get("interviewDate")),
                item.get("sourceRow", 0),
            ),
        )[-1]
        logs = [log for item in group for log in item.get("statusLogs", [])]
        latest = {**latest, "statusLogs": logs}
        people.append(latest)

    job_demands = [
        {
            "id": stable_id("historical-job", project["id"]),
            "projectId": project["id"],
            "projectName": project["name"],
            "title": "历史人员记录（源表未提供岗位）",
            "requiredCount": 0,
            "requirements": "该记录仅用于承载历史报名、面试、入职与离职数据，不代表当前招聘需求。",
            "salary": "以项目真实政策为准",
            "workTime": "以项目实际安排为准",
            "workLocation": project["branchName"],
            "deadline": "2026-12-31",
            "status": "ENDED",
            "createdAt": "2026-07-19T00:00:00.000Z",
            "notes": "系统根据真实人员名单自动建立的历史记录容器。",
        }
        for project in project_records
        if any(application["projectId"] == project["id"] for application in applications)
    ]

    legal_entities: dict[str, dict[str, Any]] = {}
    positions: dict[str, dict[str, Any]] = {}
    grades: dict[str, dict[str, Any]] = {}
    internal_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for index, row in enumerate(roster_rows, 1):
        id_card = clean_text(row.get("身份证号"))
        phone = clean_text(row.get("联系方式"))
        name = clean_text(row.get("姓名"))
        if not name or not id_card or not phone:
            continue
        key = id_card
        center = canonical_org_name(row.get("所属中心"))
        department = canonical_org_name(row.get("所属部门"))
        if department in {"高管", "/"}:
            department = "集团领导"
        if department not in blueprint_names:
            if center in blueprint_names:
                department = center
            else:
                department = None
        legal_name = clean_text(row.get("合同主体"))
        if legal_name:
            legal_entities.setdefault(legal_name, {
                "id": stable_id("legal-entity", legal_name),
                "code": stable_id("legal-code", legal_name).upper(),
                "name": legal_name,
                "taxNumber": None,
            })
        position_name = clean_text(row.get("职位")) or "待确认岗位"
        grade_name = clean_text(row.get("职级")) or "待确认职级"
        position_key = f"{department or ''}|{position_name}"
        positions.setdefault(position_key, {
            "id": stable_id("position", position_name, department),
            "code": stable_id("position-code", position_name, department).upper(),
            "name": position_name,
            "organizationUnitName": department,
        })
        grades.setdefault(grade_name, {
            "id": stable_id("job-grade", grade_name),
            "code": stable_id("grade-code", grade_name).upper(),
            "name": grade_name,
            "level": len(grades) + 1,
        })
        status_text = clean_text(row.get("状态")) or "在职"
        record = {
            "id": stable_id("internal-employee", key),
            "sourceEmployeeNo": clean_text(row.get("工号")),
            "employeeNo": _normalize_employee_no(row.get("工号"), id_card, index),
            "name": name,
            "phone": phone,
            "idCard": id_card,
            "bankAccount": clean_text(row.get("工商银行卡号")) or clean_text(row.get("徽商银行卡号")),
            "position": position_name,
            "jobGrade": grade_name,
            "organizationUnitName": department,
            "centerName": center,
            "legalEntityName": legal_name,
            "status": "LEFT" if status_text == "离职" else "ACTIVE",
            "onboardDate": clean_text(row.get("入职时间")) or "2020-01-01",
            "offboardDate": clean_text(row.get("离职时间")),
            "offboardReason": clean_text(row.get("离职类型")),
            "sourceRow": index + 2,
        }
        internal_groups[key].append(record)

    internal_employees: list[dict[str, Any]] = []
    internal_employments: list[dict[str, Any]] = []
    for key, group in internal_groups.items():
        ordered = sorted(group, key=lambda item: (_date_sort_value(item["onboardDate"]), item["sourceRow"]))
        current = ordered[-1]
        internal_employees.append(current)
        for item in ordered:
            internal_employments.append({
                "id": stable_id("internal-employment", key, item["sourceRow"]),
                "employeeId": current["id"],
                "legalEntityName": item["legalEntityName"],
                "organizationUnitName": item["organizationUnitName"],
                "position": item["position"],
                "jobGrade": item["jobGrade"],
                "startedAt": item["onboardDate"],
                "endedAt": item["offboardDate"],
                "isPrimary": item is current,
                "reason": "真实花名册导入",
            })

    source_employee_no_counts = Counter(
        employee.get("sourceEmployeeNo")
        for employee in internal_employees
        if employee.get("sourceEmployeeNo")
    )
    for employee in internal_employees:
        source_employee_no = employee.get("sourceEmployeeNo")
        if (
            not source_employee_no
            or source_employee_no == "#REF!"
            or source_employee_no_counts[source_employee_no] > 1
        ):
            employee["employeeNo"] = _normalize_employee_no(
                None,
                employee.get("idCard") or "",
                employee.get("sourceRow") or 0,
            )

    return {
        "meta": {
            "schemaVersion": 2,
            "internal": True,
            "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "sourceRows": {
                "weekly": len(weekly_rows),
                "enterprise": len(enterprise_rows),
                "roster": len(roster_rows),
            },
        },
        "organizationUnits": blueprint,
        "legalEntities": list(legal_entities.values()),
        "positions": list(positions.values()),
        "jobGrades": list(grades.values()),
        "branches": branches,
        "projects": project_records,
        "suppliers": [],
        "sourceChannels": [{
            "id": "source-channel-xiangneng-self",
            "name": "祥能自招",
            "type": "INTERNAL_SELF_RECRUITMENT",
        }],
        "people": people,
        "applications": applications,
        "jobDemands": job_demands,
        "internalEmployees": internal_employees,
        "internalEmployments": internal_employments,
        "unresolved": unresolved,
    }
