import unittest
import json
from ultra_modules.four_way_commission_auditor_plain_explainer import FourWayCommissionAuditorPlainExplainer

class TestFourWayCommissionAuditorPlainExplainer(unittest.TestCase):
    def setUp(self):
        self.auditor = FourWayCommissionAuditorPlainExplainer()

    def test_normal_case(self):
        """测试正常核验用例"""
        data = {
            "employee_id": "EMP001",
            "employee_name": "张三",
            "salary": 10000,
            "attendance_days": 22,
            "absenteeism_days": 0,
            "commission_rate": 0.1,
            "last_month_deduction": 500,
            "policy_active": True
        }
        res = self.auditor.explain(data)
        self.assertTrue(res["success"])
        self.assertEqual(res["result"]["final_commission"], 950.0)
        self.assertEqual(res["result"]["next_month_deduction"], 0.0)

    def test_dirty_data_healing(self):
        """测试脏数据自愈用例（负工资、超范围考勤天数、负提成比例）"""
        data = {
            "salary": -5000,
            "attendance_days": 40,
            "commission_rate": -0.5
        }
        res = self.auditor.explain(data)
        healed = res["data"]
        self.assertEqual(healed["salary"], 0.0)
        self.assertEqual(healed["attendance_days"], 31.0)
        self.assertEqual(healed["commission_rate"], 0.0)

    def test_missing_params_fallback(self):
        """测试缺参自动设合理默认值（零配置调用）"""
        res = self.auditor.explain() # 完全不传参
        healed = res["data"]
        self.assertEqual(healed["employee_id"], "UNKNOWN")
        self.assertEqual(healed["salary"], 0.0)
        self.assertEqual(healed["policy_active"], True)
        self.assertTrue(res["success"]) # 全0正常通过

    def test_extreme_boundary_absenteeism(self):
        """测试极端边界：旷工导致提成减半"""
        data = {
            "salary": 10000,
            "commission_rate": 0.1,
            "absenteeism_days": 1 # 有旷工
        }
        res = self.auditor.explain(data)
        self.assertEqual(res["result"]["final_commission"], 500.0) # (10000 * 0.1) / 2

    def test_extreme_boundary_next_month_deduction(self):
        """测试极端边界：提成不足扣除，结转下月"""
        data = {
            "salary": 5000,
            "last_month_deduction": 8000, # 扣除大于基础工资
            "commission_rate": 0.2
        }
        res = self.auditor.explain(data)
        # base = 5000 - 8000 = -3000
        # comm = -3000 * 0.2 = -600
        # 最终提成为0，下月扣600
        self.assertEqual(res["result"]["final_commission"], 0.0)
        self.assertEqual(res["result"]["next_month_deduction"], 600.0)
        self.assertTrue(res["success"]) # 虽然有扣除，但未触碰铁律，核对通过

    def test_iron_rules_violation(self):
        """测试触碰铁律导致不通过（比例超100%，政策未生效）"""
        data = {
            "salary": 1000,
            "attendance_days": 20,
            "commission_rate": 1.5,
            "policy_active": False
        }
        res = self.auditor.explain(data)
        self.assertFalse(res["success"])
        self.assertIn("4. 提成比例必须在0%到100%之间", res["result"]["issues"])
        self.assertIn("6. 政策生效时间必须合法且覆盖当前核对周期", res["result"]["issues"])

if __name__ == '__main__':
    unittest.main()
