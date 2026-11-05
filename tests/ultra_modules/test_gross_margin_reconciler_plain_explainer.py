import unittest
import json
import math
from ultra_modules.gross_margin_reconciler_plain_explainer import generate_explainer_card, _safe_float

class TestGrossMarginReconcilerPlainExplainer(unittest.TestCase):

    def test_normal_case(self):
        result = generate_explainer_card(
            project_name="外卖配送员外包",
            month="2023年10月",
            receivable_billing=100000.0,
            payable_equal_pay=60000.0,
            payable_rebate=10000.0,
            payable_self_recruit_commission=5000.0
        )
        data = json.loads(result["json"])

        self.assertEqual(data["project_name"], "外卖配送员外包")
        self.assertEqual(data["month"], "2023年10月")
        self.assertAlmostEqual(data["receivable"]["billing"], 100000.0)
        self.assertAlmostEqual(data["payable"]["equal_pay"], 60000.0)
        self.assertAlmostEqual(data["payable"]["rebate"], 10000.0)
        self.assertAlmostEqual(data["payable"]["self_recruit_commission"], 5000.0)
        self.assertAlmostEqual(data["payable"]["total_payable"], 75000.0)
        self.assertAlmostEqual(data["gross_margin"], 25000.0)
        self.assertIn("外卖配送员外包", data["plain_explanation"])
        self.assertIn("25000.00", data["plain_explanation"])

    def test_missing_parameters_default_fallback(self):
        result = generate_explainer_card()
        data = json.loads(result["json"])

        self.assertEqual(data["project_name"], "未知项目")
        self.assertEqual(data["month"], "未知月份")
        self.assertAlmostEqual(data["receivable"]["billing"], 0.0)
        self.assertAlmostEqual(data["payable"]["total_payable"], 0.0)
        self.assertAlmostEqual(data["gross_margin"], 0.0)

    def test_dirty_data_self_healing(self):
        result = generate_explainer_card(
            project_name=None,
            month=123,
            receivable_billing="10000.5",
            payable_equal_pay="invalid",
            payable_rebate=None,
            payable_self_recruit_commission={"wrong": "type"}
        )
        data = json.loads(result["json"])

        self.assertEqual(data["project_name"], "未知项目")
        self.assertEqual(data["month"], "123")
        self.assertAlmostEqual(data["receivable"]["billing"], 10000.5)
        self.assertAlmostEqual(data["payable"]["equal_pay"], 0.0)
        self.assertAlmostEqual(data["payable"]["rebate"], 0.0)
        self.assertAlmostEqual(data["payable"]["self_recruit_commission"], 0.0)
        self.assertAlmostEqual(data["gross_margin"], 10000.5)

    def test_extreme_boundaries(self):
        # Extremely large numbers
        large_num = 1e12
        result = generate_explainer_card(
            receivable_billing=large_num,
            payable_equal_pay=large_num / 2,
            payable_rebate=large_num / 4,
            payable_self_recruit_commission=large_num / 4
        )
        data = json.loads(result["json"])
        self.assertAlmostEqual(data["gross_margin"], 0.0)

        # Negative values - we just test that the math still holds
        # Depending on business logic, maybe negative is clamped to 0,
        # but here we allow standard math unless specified otherwise.
        result2 = generate_explainer_card(
            receivable_billing=-500,
            payable_equal_pay=-200
        )
        data2 = json.loads(result2["json"])
        self.assertAlmostEqual(data2["gross_margin"], -300.0)

    def test_formatting_check(self):
        result = generate_explainer_card(
            project_name="测试",
            month="一月",
            receivable_billing=100.0,
            payable_equal_pay=10.0
        )

        # Test markdown format
        md = result["markdown"]
        self.assertTrue(md.startswith("### 📊 【测试】项目 一月 对账单（极简版）"))
        self.assertIn("**100.00**", md)
        self.assertIn("**90.00**", md)

        # Test HTML format
        html = result["html"]
        self.assertTrue(html.startswith("<div class='reconciliation-card'"))
        self.assertIn("<strong>100.00</strong>", html)
        self.assertIn("<span style='color: #d9534f;'>90.00</span>", html)

    def test_safe_float_special_cases(self):
        self.assertEqual(_safe_float(math.nan), 0.0)
        self.assertEqual(_safe_float(math.inf), 0.0)
        self.assertEqual(_safe_float("-inf"), 0.0)
        self.assertEqual(_safe_float("NaN"), 0.0)
        self.assertEqual(_safe_float(10.5), 10.5)

if __name__ == '__main__':
    unittest.main()
