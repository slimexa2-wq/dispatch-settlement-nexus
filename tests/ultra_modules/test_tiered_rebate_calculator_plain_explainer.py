import unittest
import json
from ultra_modules.tiered_rebate_calculator_plain_explainer import TieredRebateCalculatorPlainExplainer

class TestTieredRebateCalculatorPlainExplainer(unittest.TestCase):
    def test_normal_case(self):
        """Test a normal case with valid inputs."""
        calc = TieredRebateCalculatorPlainExplainer(
            worked_days=20,
            absent_days=1,
            deduction_per_absent_day=100.0,
            tiers={7: 500, 15: 1000, 30: 2000, 45: 3000}
        )
        res = calc.calculate()
        self.assertEqual(res['worked_days'], 20)
        self.assertEqual(res['absent_days'], 1)
        self.assertEqual(res['base_rebate'], 1000.0)
        self.assertEqual(res['deduction'], 100.0)
        self.assertEqual(res['final_rebate'], 900.0)
        self.assertEqual(res['next_tier_days'], 30)

    def test_missing_parameter_defaults(self):
        """Test missing parameter defaults (empty init)."""
        calc = TieredRebateCalculatorPlainExplainer()
        res = calc.calculate()
        self.assertEqual(res['worked_days'], 0)
        self.assertEqual(res['absent_days'], 0)
        self.assertEqual(res['base_rebate'], 0.0)
        self.assertEqual(res['deduction'], 0.0)
        self.assertEqual(res['final_rebate'], 0.0)
        self.assertEqual(res['next_tier_days'], 7)
        self.assertEqual(res['next_tier_rebate'], 500.0)

    def test_dirty_data_injection(self):
        """Test dirty data injection and self-healing."""
        calc = TieredRebateCalculatorPlainExplainer(
            worked_days="15天",
            absent_days="2",
            deduction_per_absent_day="50.5元",
            tiers={"7天": "500元", "15天": 1000.0, "abc": "def"}
        )
        res = calc.calculate()
        self.assertEqual(res['worked_days'], 15)
        self.assertEqual(res['absent_days'], 2)
        self.assertEqual(res['base_rebate'], 1000.0)
        self.assertEqual(res['deduction'], 101.0)
        self.assertEqual(res['final_rebate'], 899.0)

    def test_extreme_boundary_limits(self):
        """Test extreme boundary limits."""
        calc = TieredRebateCalculatorPlainExplainer(
            worked_days=9999,
            absent_days=10000,
            deduction_per_absent_day=10.0
        )
        res = calc.calculate()
        self.assertEqual(res['worked_days'], 9999)
        # Assuming defaults tiers are 7, 15, 30, 45
        self.assertEqual(res['achieved_tier_days'], 45)
        self.assertEqual(res['base_rebate'], 3000.0)
        self.assertEqual(res['deduction'], 100000.0)
        # Final rebate cannot be negative
        self.assertEqual(res['final_rebate'], 0.0)
        self.assertIsNone(res['next_tier_days'])

    def test_export_formats(self):
        """Test the JSON, Markdown, and HTML export outputs."""
        calc = TieredRebateCalculatorPlainExplainer(
            worked_days=20, absent_days=1, deduction_per_absent_day=100.0
        )

        json_out = json.loads(calc.export("json"))
        self.assertEqual(json_out['result']['final_rebate'], 900.0)

        md_out = calc.export("markdown")
        self.assertIn("## 返费结算卡片", md_out)
        self.assertIn("900.0", md_out)

        html_out = calc.export("html")
        self.assertIn("div class=\"rebate-card\"", html_out)
        self.assertIn("¥900.0", html_out)

if __name__ == '__main__':
    unittest.main()
