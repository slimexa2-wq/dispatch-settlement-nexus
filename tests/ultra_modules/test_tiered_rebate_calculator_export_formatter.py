import unittest
import math
from ultra_modules.tiered_rebate_calculator_export_formatter import calculate_and_format_rebate

class TestTieredRebateCalculatorExportFormatter(unittest.TestCase):
    def test_normal_tiered_calculation(self):
        records = [
            {"worker_id": "W001", "name": "Alice", "days_worked": 7, "absent_days": 0},
            {"worker_id": "W002", "name": "Bob", "days_worked": 16, "absent_days": 1},
            {"worker_id": "W003", "name": "Charlie", "days_worked": 30, "absent_days": 2},
            {"worker_id": "W004", "name": "David", "days_worked": 46, "absent_days": 0},
            {"worker_id": "W005", "name": "Eve", "days_worked": 5, "absent_days": 0},
        ]
        result = calculate_and_format_rebate(records)
        export_data = result["export_data"]

        self.assertEqual(len(export_data), 5)

        # W001: 7 days, tier 7 (500), 0 deduction -> 500
        self.assertEqual(export_data[0]["final_rebate"], 500)
        self.assertEqual(export_data[0]["tier_achieved"], 7)
        self.assertEqual(export_data[0]["comments"], 0)

        # W002: 16 days, tier 15 (1500), 1 deduction (100) -> 1400
        self.assertEqual(export_data[1]["final_rebate"], 1400)
        self.assertEqual(export_data[1]["tier_achieved"], 15)

        # W003: 30 days, tier 30 (3000), 2 deductions (200) -> 2800
        self.assertEqual(export_data[2]["final_rebate"], 2800)

        # W004: 46 days, tier 45 (5000), 0 deductions -> 5000
        self.assertEqual(export_data[3]["final_rebate"], 5000)

        # W005: 5 days, tier 0 -> 0
        self.assertEqual(export_data[4]["final_rebate"], 0)

        report = result["report_text"]
        self.assertIn("核算 5 人", report)
        self.assertIn("达标并产生返费 4 人", report)
        self.assertIn("总计应发返费金额：9,700.00 元", report)

    def test_dirty_data_self_healing(self):
        records = [
            {"worker_id": None, "name": None, "days_worked": "NaN", "absent_days": None},
            {"worker_id": "W007", "name": "Frank", "days_worked": " 30 ", "absent_days": "2 "},
            "not_a_dict",  # Should be skipped or defaulted
            {"worker_id": "W008", "days_worked": math.nan, "absent_days": math.inf},
        ]
        result = calculate_and_format_rebate(records)
        export_data = result["export_data"]

        self.assertEqual(len(export_data), 4)

        # First row self-healed
        self.assertEqual(export_data[0]["days_worked"], 0)
        self.assertEqual(export_data[0]["absent_days"], 0)
        self.assertEqual(export_data[0]["final_rebate"], 0)

        # Second row string parsing
        self.assertEqual(export_data[1]["days_worked"], 30)
        self.assertEqual(export_data[1]["absent_days"], 2)
        self.assertEqual(export_data[1]["final_rebate"], 2800)

        # Third row invalid dict
        self.assertEqual(export_data[2]["days_worked"], 0)

        # Fourth row math.nan/inf
        self.assertEqual(export_data[3]["days_worked"], 0)
        self.assertEqual(export_data[3]["absent_days"], 0)

    def test_missing_parameter_fallbacks(self):
        # Should not crash on completely missing input
        result = calculate_and_format_rebate(None, None)
        self.assertEqual(len(result["export_data"]), 0)
        self.assertIn("核算 0 人", result["report_text"])

    def test_extreme_boundaries(self):
        rules = {
            "tiers": {"7": 500, "15": 1500, "30": 3000, "45": 5000},
            "deduction_per_absent_day": 100
        }
        records = [
            # Negative days should heal to 0
            {"worker_id": "W101", "days_worked": -10, "absent_days": -5},
            # Deduction exceeds base rebate -> floor to 0
            {"worker_id": "W102", "days_worked": 7, "absent_days": 10},
            # High rebate amounts
            {"worker_id": "W103", "days_worked": 1000, "absent_days": 0},
        ]

        result = calculate_and_format_rebate(records, rules)
        export_data = result["export_data"]

        # Negative days
        self.assertEqual(export_data[0]["days_worked"], 0)
        self.assertEqual(export_data[0]["absent_days"], 0)
        self.assertEqual(export_data[0]["final_rebate"], 0)

        # Deduction floor
        self.assertEqual(export_data[1]["base_rebate"], 500)
        self.assertEqual(export_data[1]["deduction"], 1000)
        self.assertEqual(export_data[1]["final_rebate"], 0) # Should floor to 0

        # High amounts
        self.assertEqual(export_data[2]["final_rebate"], 5000)

    def test_empty_and_zero_results(self):
        records = []
        result = calculate_and_format_rebate(records)

        self.assertEqual(len(result["export_data"]), 0)
        self.assertEqual(len(result["audit_log"]), 3) # Start, rule missing default, and end
        self.assertIn("核算 0 人", result["report_text"])
        self.assertIn("达标并产生返费 0 人", result["report_text"])
        self.assertIn("总计应发返费金额：0.00 元", result["report_text"])

if __name__ == "__main__":
    unittest.main()
