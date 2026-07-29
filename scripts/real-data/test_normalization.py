import unittest
from normalization import (
    canonical_org_name,
    is_project_summary,
    normalize_interview_result,
    normalize_real_business_data,
)

class NormalizationTest(unittest.TestCase):
    def test_summary_rows_are_not_projects(self):
        self.assertTrue(is_project_summary("33个项目、1个外送"))
        self.assertTrue(is_project_summary("206个项目、10个外送"))
        self.assertFalse(is_project_summary("三江时代"))

    def test_source_departments_map_to_real_organization(self):
        self.assertEqual(canonical_org_name("宜宾分公司运营部"), "宜宾分公司")
        self.assertEqual(canonical_org_name("保安子公司"), "祥能保安公司")
        self.assertEqual(canonical_org_name("运营中心"), "MOC运营中心")

    def test_organization_blueprint_contains_real_parent_ids_and_paths(self):
        data = normalize_real_business_data([], [], [])
        by_name = {item["name"]: item for item in data["organizationUnits"]}
        group = by_name["四川祥能人力资本服务有限公司"]
        moc = by_name["MOC运营中心"]
        yibin = by_name["宜宾分公司"]
        self.assertIsNone(group["parentId"])
        self.assertEqual(moc["parentId"], group["id"])
        self.assertEqual(yibin["parentId"], moc["id"])
        self.assertEqual(group["path"], f"/{group['id']}")
        self.assertEqual(moc["path"], f"/{group['id']}/{moc['id']}")
        self.assertEqual(yibin["path"], f"/{group['id']}/{moc['id']}/{yibin['id']}")

    def test_interview_result_is_mapped_without_claiming_false_employment(self):
        self.assertEqual(normalize_interview_result("已离职", None, "2026-07-18")["status"], "LEFT")
        self.assertEqual(normalize_interview_result("面试通过", None, None)["status"], "PENDING_ONBOARD")
        self.assertEqual(normalize_interview_result("面试未通过", None, None)["interviewStatus"], "FAILED")


    def test_duplicate_roster_employee_numbers_keep_source_value_and_get_unique_system_numbers(self):
        roster = [
            {"状态":"在职","姓名":"甲","工号":"1020001","身份证号":"510000000000000001","联系方式":"13800000001","所属中心":"管理中心","所属部门":"人力资源部","职位":"人事专员","职级":"专员级","合同主体":"四川祥能人力资本服务有限公司","入职时间":"2026-01-01"},
            {"状态":"在职","姓名":"乙","工号":"1020001","身份证号":"510000000000000002","联系方式":"13800000002","所属中心":"管理中心","所属部门":"人力资源部","职位":"人事专员","职级":"专员级","合同主体":"四川祥能人力资本服务有限公司","入职时间":"2026-01-02"},
        ]
        data = normalize_real_business_data([], [], roster)
        employees = sorted(data["internalEmployees"], key=lambda item: item["name"])
        self.assertEqual([item["sourceEmployeeNo"] for item in employees], ["1020001", "1020001"])
        self.assertEqual(len({item["employeeNo"] for item in employees}), 2)
        self.assertTrue(all(item["employeeNo"].startswith("XN-") for item in employees))


    def test_same_position_name_in_different_departments_keeps_both_real_positions(self):
        roster = [
            {"状态":"在职","姓名":"甲","工号":"A1","身份证号":"510000000000000001","联系方式":"13800000001","所属中心":"管理中心","所属部门":"人力资源部","职位":"人事助理","职级":"助理级","合同主体":"四川祥能人力资本服务有限公司","入职时间":"2026-01-01"},
            {"状态":"在职","姓名":"乙","工号":"A2","身份证号":"510000000000000002","联系方式":"13800000002","所属中心":"MOC运营中心","所属部门":"郫都分公司","职位":"人事助理","职级":"助理级","合同主体":"四川祥能人力资本服务有限公司","入职时间":"2026-01-02"},
        ]
        data = normalize_real_business_data([], [], roster)
        self.assertEqual(
            sorted((item["organizationUnitName"], item["name"]) for item in data["positions"]),
            [("人力资源部", "人事助理"), ("郫都分公司", "人事助理")],
        )

    def test_people_are_deduplicated_but_applications_are_preserved(self):
        weekly = [
            {"区域":"宜宾分公司","项目名称":"四川时代外包","业务类型":"外包","7月19日自招":10,"7月19日供应商":20,"7月19日在职合计":30,"本期入职":2,"本期离职":1,"环比变化":1,"原因说明":None}
        ]
        enterprise = [
            {"面试日期":"2026-07-01","姓名":"张三","身份证":"510000000000000001","面试企业":"四川时代外包","供应商":"祥能自招","电话":"13800000001","面试结果":"已入职","所属部门":"宜宾分公司运营部","入职日期":"2026-07-03"},
            {"面试日期":"2026-07-10","姓名":"张三","身份证":"510000000000000001","面试企业":"四川时代外包","供应商":"祥能自招","电话":"13800000001","面试结果":"已离职","所属部门":"宜宾分公司运营部","入职日期":"2026-07-03","离职日期":"2026-07-12"},
        ]
        data = normalize_real_business_data(weekly, enterprise, [])
        self.assertEqual(len(data["people"]), 1)
        self.assertEqual(len(data["applications"]), 2)
        self.assertEqual(data["people"][0]["status"], "LEFT")
        self.assertEqual(data["projects"][0]["name"], "四川时代外包")
        self.assertEqual(data["projects"][0]["branchName"], "宜宾分公司")

if __name__ == "__main__":
    unittest.main()
