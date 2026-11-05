import unittest
import json
from decimal import Decimal
from ultra_modules.advance_loan_deduction_guard_plain_explainer import generate_deduction_explainer

class TestAdvanceLoanDeductionGuardPlainExplainer(unittest.TestCase):

    def test_normal_case(self):
        """Test a normal case where full deduction is allowed."""
        data = {
            "worker_name": "张三",
            "total_salary": 5000,
            "living_expenses": 500,
            "weekly_advances": 1000
        }
        result = generate_deduction_explainer(data)
        result_json = json.loads(result["json"])

        self.assertEqual(result_json["worker_name"], "张三")
        self.assertEqual(result_json["total_salary"], 5000.0)
        self.assertEqual(result_json["requested_deduction"], 1500.0)
        self.assertEqual(result_json["actual_deduction"], 1500.0)
        self.assertEqual(result_json["final_payout"], 3500.0)
        self.assertEqual(result_json["remaining_advance_debt"], 0.0)
        self.assertFalse(result_json["protection_triggered"])

        self.assertIn("张三", result["text"])
        self.assertIn("全额正常抵扣", result["text"])
        self.assertNotIn("已触发防超扣保护", result["text"])

    def test_over_deduction_case(self):
        """Test case where requested deduction exceeds max allowable deduction."""
        data = {
            "worker_name": "李四",
            "total_salary": 3000,
            "living_expenses": 1000,
            "weekly_advances": 2000
        }
        result = generate_deduction_explainer(data)
        result_json = json.loads(result["json"])

        # Max allowable deduction = 3000 * 0.8 = 2400
        self.assertEqual(result_json["worker_name"], "李四")
        self.assertEqual(result_json["total_salary"], 3000.0)
        self.assertEqual(result_json["requested_deduction"], 3000.0)
        self.assertEqual(result_json["max_allowable_deduction"], 2400.0)
        self.assertEqual(result_json["actual_deduction"], 2400.0)
        self.assertEqual(result_json["final_payout"], 600.0)
        self.assertEqual(result_json["remaining_advance_debt"], 600.0)
        self.assertTrue(result_json["protection_triggered"])

        self.assertIn("已触发防超扣保护", result["text"])
        self.assertIn("未扣完的借支欠款：600.00 元", result["text"])

    def test_missing_parameter_fallback(self):
        """Test zero-configuration where missing data uses reasonable defaults."""
        result = generate_deduction_explainer(None)
        result_json = json.loads(result["json"])

        self.assertEqual(result_json["worker_name"], "未知员工")
        self.assertEqual(result_json["total_salary"], 0.0)
        self.assertEqual(result_json["requested_deduction"], 0.0)
        self.assertEqual(result_json["actual_deduction"], 0.0)
        self.assertEqual(result_json["final_payout"], 0.0)
        self.assertEqual(result_json["remaining_advance_debt"], 0.0)
        self.assertFalse(result_json["protection_triggered"])

    def test_dirty_data_self_healing(self):
        """Test with string amounts, None, and negative numbers."""
        data = {
            "worker_name": "  ", # Empty string after strip
            "total_salary": "4000.50",
            "living_expenses": None,
            "weekly_advances": -500, # Should be treated as 0
            "extra_field": "ignore me"
        }
        result = generate_deduction_explainer(data)
        result_json = json.loads(result["json"])

        self.assertEqual(result_json["worker_name"], "未知员工")
        self.assertEqual(result_json["total_salary"], 4000.5)
        self.assertEqual(result_json["living_expenses"], 0.0)
        self.assertEqual(result_json["weekly_advances"], 0.0)
        self.assertEqual(result_json["requested_deduction"], 0.0)
        self.assertEqual(result_json["actual_deduction"], 0.0)
        self.assertEqual(result_json["final_payout"], 4000.5)
        self.assertFalse(result_json["protection_triggered"])

    def test_extreme_edge_cases(self):
        """Test edge cases: 0 salary and massive deductions."""
        data = {
            "worker_name": "王五",
            "total_salary": 0,
            "living_expenses": 5000,
            "weekly_advances": 5000
        }
        result = generate_deduction_explainer(data)
        result_json = json.loads(result["json"])

        self.assertEqual(result_json["total_salary"], 0.0)
        self.assertEqual(result_json["requested_deduction"], 10000.0)
        self.assertEqual(result_json["max_allowable_deduction"], 0.0)
        self.assertEqual(result_json["actual_deduction"], 0.0)
        self.assertEqual(result_json["final_payout"], 0.0)
        self.assertEqual(result_json["remaining_advance_debt"], 10000.0)
        self.assertTrue(result_json["protection_triggered"])

        self.assertIn("已触发防超扣保护", result["html"])
        self.assertIn("未扣完的借支欠款：10000.00 元", result["markdown"])

if __name__ == "__main__":
    unittest.main()
