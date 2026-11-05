import unittest
from ultra_modules.shift_overtime_converter_plain_explainer import ShiftOvertimeConverterPlainExplainer

class TestShiftOvertimeConverterPlainExplainer(unittest.TestCase):
    def setUp(self):
        self.explainer = ShiftOvertimeConverterPlainExplainer()

    def test_normal_case(self):
        data = {
            'base_salary': 3000,
            'hourly_wage': 20,
            'regular_ot_hours': 10,  # 10 * 20 * 1.5 = 300
            'weekend_ot_hours': 5,   # 5 * 20 * 2.0 = 200
            'holiday_ot_hours': 2,   # 2 * 20 * 3.0 = 120
            'night_shift_days': 15,
            'white_shift_days': 10,
            'night_shift_allowance': 15, # 15 * 15 = 225
            'white_shift_allowance': 5   # 10 * 5 = 50
        }
        # Total: 3000 + 300 + 200 + 120 + 225 + 50 = 3895
        result = self.explainer.explain(data)

        self.assertIn("json_card", result)
        self.assertIn("markdown_card", result)
        self.assertIn("html_card", result)

        json_data = result["json_card"]
        self.assertEqual(json_data["total_pay"], 3895.0)
        self.assertEqual(json_data["base_salary"], 3000.0)
        self.assertEqual(json_data["overtime_pay"]["regular"], 300.0)
        self.assertEqual(json_data["overtime_pay"]["weekend"], 200.0)
        self.assertEqual(json_data["overtime_pay"]["holiday"], 120.0)
        self.assertEqual(json_data["allowances"]["night_shift"], 225.0)
        self.assertEqual(json_data["allowances"]["white_shift"], 50.0)

        self.assertIn("您的总收入为 3895.00 元", result["markdown_card"])
        self.assertIn("平日加班（1.5倍）：10 小时，共 300.00 元", result["markdown_card"])

        self.assertIn('<div class="salary-card">', result["html_card"])
        self.assertIn("夜班津贴：15 天，共 225.00 元", result["html_card"])

    def test_missing_parameters(self):
        # Only base salary provided, other parameters should default to 0
        data = {
            'base_salary': 3000
        }
        result = self.explainer.explain(data)

        json_data = result["json_card"]
        self.assertEqual(json_data["total_pay"], 3000.0)
        self.assertEqual(json_data["overtime_pay"]["regular"], 0.0)
        self.assertEqual(json_data["allowances"]["night_shift"], 0.0)

        # Checking markdown and HTML string formatting
        self.assertIn("您的总收入为 3000.00 元", result["markdown_card"])
        self.assertIn("基本工资：3000.00 元", result["html_card"])
        self.assertNotIn("加班", result["markdown_card"])

    def test_dirty_data_self_healing(self):
        # Strings with numbers, negative numbers, None values, completely invalid strings
        data = {
            'base_salary': "3000.5元",
            'hourly_wage': "-20", # Negative should be bounded to 0
            'regular_ot_hours': "10 hours",
            'weekend_ot_hours': None,
            'holiday_ot_hours': "invalid",
            'night_shift_days': -5, # Negative should be bounded to 0
            'white_shift_days': "0",
            'night_shift_allowance': 10,
            'white_shift_allowance': 5
        }
        # hourly_wage is -20 -> bounded to 0
        # regular_ot_hours is 10, but hourly wage is 0 -> 0 overtime pay
        # base_salary is 3000.5
        result = self.explainer.explain(data)
        json_data = result["json_card"]
        self.assertEqual(json_data["total_pay"], 3000.5)
        self.assertEqual(json_data["base_salary"], 3000.5)
        self.assertEqual(json_data["overtime_pay"]["regular"], 0.0)
        self.assertEqual(json_data["allowances"]["night_shift"], 0.0) # days is -5 -> 0 -> 0 pay

    def test_extreme_boundaries(self):
        # Zero base salary, extremely high overtime
        data = {
            'base_salary': 0,
            'hourly_wage': 100,
            'regular_ot_hours': 1000, # 1000 * 100 * 1.5 = 150000
            'weekend_ot_hours': 500,  # 500 * 100 * 2.0 = 100000
            'holiday_ot_hours': 100,  # 100 * 100 * 3.0 = 30000
            'night_shift_days': 30,
            'white_shift_days': 0,
            'night_shift_allowance': 50, # 30 * 50 = 1500
            'white_shift_allowance': 0
        }
        # Total: 150000 + 100000 + 30000 + 1500 = 281500
        result = self.explainer.explain(data)
        json_data = result["json_card"]
        self.assertEqual(json_data["total_pay"], 281500.0)
        self.assertEqual(json_data["base_salary"], 0.0)

        self.assertNotIn("基本工资", result["markdown_card"]) # Should not be displayed since it's 0
        self.assertIn("您的总收入为 281500.00 元", result["markdown_card"])
        self.assertIn("假日加班", result["markdown_card"])

    def test_all_zeros_and_empty(self):
        # Empty dict should yield 0 for everything
        result = self.explainer.explain({})
        json_data = result["json_card"]
        self.assertEqual(json_data["total_pay"], 0.0)
        self.assertEqual(json_data["base_salary"], 0.0)

        # Only the total summary should be present, no details
        self.assertIn("您的总收入为 0.00 元", result["markdown_card"])
        self.assertNotIn("- ", result["markdown_card"]) # No list items
        self.assertIn("您的总收入为 0.00 元", result["html_card"])
        self.assertNotIn("<li>", result["html_card"])

        result_none = self.explainer.explain(None)
        self.assertEqual(result_none["json_card"]["total_pay"], 0.0)

if __name__ == '__main__':
    unittest.main()
