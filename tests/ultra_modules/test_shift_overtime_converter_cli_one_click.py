import unittest
import os
import json
import csv
from ultra_modules.shift_overtime_converter_cli_one_click import ShiftOvertimeConverter, run_cli_one_click

class TestShiftOvertimeConverter(unittest.TestCase):
    def setUp(self):
        self.json_file = "test_output.json"
        self.csv_file = "test_output.csv"

    def tearDown(self):
        if os.path.exists(self.json_file):
            os.remove(self.json_file)
        if os.path.exists(self.csv_file):
            os.remove(self.csv_file)

    def test_normal_case(self):
        """Test normal data for day and night shifts with all OT hours."""
        data = [
            {
                "employee_id": "T001",
                "base_rate": 20.0,
                "shift": "day",
                "normal_ot_hours": 2,
                "weekend_ot_hours": 1,
                "holiday_ot_hours": 1
            },
            {
                "employee_id": "T002",
                "base_rate": 25.0,
                "shift": "night",
                "normal_ot_hours": 0,
                "weekend_ot_hours": 8,
                "holiday_ot_hours": 0
            }
        ]
        converter = ShiftOvertimeConverter(data)
        results = converter.process()

        self.assertEqual(len(results), 2)
        r1 = results[0]
        # Base pay: 20 * 8 = 160
        # Normal OT: 2 * 20 * 1.5 = 60
        # Weekend OT: 1 * 20 * 2 = 40
        # Holiday OT: 1 * 20 * 3 = 60
        # Total: 160 + 60 + 40 + 60 = 320
        self.assertEqual(r1["total_pay"], 320.0)
        self.assertEqual(r1["night_allowance"], 0.0)

        r2 = results[1]
        # Base pay: 25 * 8 = 200
        # Night allowance: 20
        # Weekend OT: 8 * 25 * 2 = 400
        # Total: 200 + 20 + 400 = 620
        self.assertEqual(r2["total_pay"], 620.0)
        self.assertEqual(r2["night_allowance"], 20.0)

    def test_dirty_data_self_healing(self):
        """Test how the converter heals bad data (negative values, string instead of float, invalid shift)."""
        data = [
            {
                "employee_id": "T003",
                "base_rate": "invalid_rate", # should default to 20.0
                "shift": "unknown_shift",    # should default to day
                "normal_ot_hours": -10,      # should default to 0.0
                "weekend_ot_hours": "abc"    # should default to 0.0
            }
        ]
        converter = ShiftOvertimeConverter(data)
        results = converter.process()

        r = results[0]
        self.assertEqual(r["base_rate"], 20.0)
        self.assertEqual(r["shift"], "day")
        self.assertEqual(r["normal_ot_pay"], 0.0)
        self.assertEqual(r["weekend_ot_pay"], 0.0)
        self.assertEqual(r["total_pay"], 160.0) # Just 20 * 8

    def test_missing_parameter_fallbacks(self):
        """Test with completely empty dictionary to see if all parameters fallback correctly."""
        data = [{}]
        converter = ShiftOvertimeConverter(data)
        results = converter.process()

        r = results[0]
        self.assertEqual(r["employee_id"], "UNKNOWN")
        self.assertEqual(r["base_rate"], 20.0)
        self.assertEqual(r["shift"], "day")
        self.assertEqual(r["normal_ot_pay"], 0.0)
        self.assertEqual(r["total_pay"], 160.0)

    def test_extreme_boundaries(self):
        """Test with zero rate (should bump to 20.0) and huge hours."""
        data = [
            {
                "employee_id": "T004",
                "base_rate": 0, # Should fallback to 20.0 as minimum rate
                "shift": "night",
                "normal_ot_hours": 999,
                "weekend_ot_hours": 999,
                "holiday_ot_hours": 999
            }
        ]
        converter = ShiftOvertimeConverter(data)
        results = converter.process()

        r = results[0]
        self.assertEqual(r["base_rate"], 20.0)
        # 8 * 20 = 160 base
        # + 20 allowance = 180
        # Normal OT = 999 * 20 * 1.5 = 29970
        # Weekend OT = 999 * 20 * 2.0 = 39960
        # Holiday OT = 999 * 20 * 3.0 = 59940
        # Total = 180 + 29970 + 39960 + 59940 = 130050.0
        self.assertEqual(r["total_pay"], 130050.0)

    def test_export_functionality(self):
        """Test the export to JSON and CSV works."""
        data = [
            {
                "employee_id": "T005",
                "base_rate": 20.0,
                "shift": "day",
                "normal_ot_hours": 2,
                "weekend_ot_hours": 0,
                "holiday_ot_hours": 0
            }
        ]
        converter = ShiftOvertimeConverter(data)
        results = converter.process()
        converter.export(results, json_path=self.json_file, csv_path=self.csv_file)

        self.assertTrue(os.path.exists(self.json_file))
        self.assertTrue(os.path.exists(self.csv_file))

        with open(self.json_file, 'r', encoding='utf-8') as f:
            exported_json = json.load(f)
            self.assertEqual(exported_json[0]["employee_id"], "T005")

        with open(self.csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["employee_id"], "T005")

    def test_cli_one_click_runner(self):
        """Test the CLI runner which defaults to the hardcoded dataset."""
        results = run_cli_one_click()
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0]["employee_id"], "EMP001")
        self.assertEqual(results[1]["employee_id"], "EMP002")
        self.assertEqual(results[2]["employee_id"], "EMP003")

if __name__ == '__main__':
    unittest.main()
