import unittest
import os
import json
import sys
import pandas as pd
from unittest.mock import patch

from ultra_modules.social_security_prorater_cli_one_click import load_data, save_data, run_proration, main

class TestSocialSecurityProraterCliOneClick(unittest.TestCase):

    def setUp(self):
        self.test_json_input = "test_input.json"
        self.test_json_output = "test_output.json"
        self.test_xlsx_input = "test_input.xlsx"
        self.test_xlsx_output = "test_output.xlsx"

        # Cleanup any existing test files
        for f in [self.test_json_input, self.test_json_output, self.test_xlsx_input, self.test_xlsx_output, "proration_results.json"]:
            if os.path.exists(f):
                os.remove(f)

    def tearDown(self):
        # Cleanup after tests
        for f in [self.test_json_input, self.test_json_output, self.test_xlsx_input, self.test_xlsx_output, "proration_results.json", "fallback_test.txt", "fallback_test.txt.json", "test_input.txt"]:
            if os.path.exists(f):
                os.remove(f)

    def test_normal_execution(self):
        """Test valid parameters without files."""
        # Using run_proration with no input file invokes fallback load
        results = run_proration(input_file=None, output_file=self.test_json_output)
        self.assertTrue(len(results) > 0)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['employee_id'], 'DEFAULT_001')
        self.assertTrue(os.path.exists(self.test_json_output))

    def test_dirty_data_self_healing(self):
        """Test dirty data with strings and missing values."""
        dirty_data = {
            "employee_id": "EMP_002",
            "base_salary": "  15,000.50  ",
            "target_month": "2023.11",
            "onboard_date": "2023/11/05",
            "offboard_date": "invalid_date"
        }
        with open(self.test_json_input, 'w') as f:
            json.dump([dirty_data], f)

        results = run_proration(input_file=self.test_json_input, output_file=self.test_json_output)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['bounded_base'], 15000.50)
        self.assertEqual(res['active_days'], 26) # 30 - 5 + 1
        self.assertEqual(res['days_in_month'], 30)

    def test_missing_parameter_default_fallbacks(self):
        """Test missing parameter default fallbacks."""
        # Empty dict fallback
        with open(self.test_json_input, 'w') as f:
            json.dump([{}], f)

        results = run_proration(input_file=self.test_json_input, output_file=self.test_json_output)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['bounded_base'], 3000.0) # floor

    def test_extreme_boundary_conditions(self):
        """Test extreme boundaries like very high salary."""
        extreme_data = {
            "base_salary": 9999999.0,
            "target_month": "2023-12"
        }
        with open(self.test_json_input, 'w') as f:
            json.dump([extreme_data], f)

        results = run_proration(input_file=self.test_json_input, output_file=self.test_json_output)
        res = results[0]
        self.assertEqual(res['bounded_base'], 30000.0) # cap
        self.assertEqual(res['proration_ratio'], 1.0)
        self.assertEqual(res['prorated_base'], 30000.0)

    def test_cli_and_file_io(self):
        """Test sys.argv, fallback behavior, Excel/JSON read/writes."""
        # Excel read/write
        df = pd.DataFrame([{
            "employee_id": "XLSX_001",
            "base_salary": 12000,
            "target_month": "2023-12"
        }])
        df.to_excel(self.test_xlsx_input, index=False)

        # Mock sys.argv
        test_args = ["social_security_prorater_cli_one_click.py", "-i", self.test_xlsx_input, "-o", self.test_xlsx_output]
        with patch.object(sys, 'argv', test_args):
            main()

        self.assertTrue(os.path.exists(self.test_xlsx_output))
        out_df = pd.read_excel(self.test_xlsx_output)
        self.assertEqual(len(out_df), 1)
        self.assertEqual(out_df.iloc[0]['employee_id'], "XLSX_001")
        self.assertEqual(out_df.iloc[0]['bounded_base'], 12000)

        # Test corrupt JSON loading (falls back to default logic)
        with open("corrupt.json", 'w') as f:
            f.write("{invalid_json: true")
        data = load_data("corrupt.json")
        self.assertEqual(len(data), 0)  # corrupt.json exists, returns []
        os.remove("corrupt.json")

        # Test unknown extension save
        save_data(data, "fallback_test.txt")
        self.assertTrue(os.path.exists("fallback_test.txt.json"))

        # Test single dict JSON load
        with open(self.test_json_input, 'w') as f:
            json.dump({"employee_id": "DICT_001"}, f)
        data = load_data(self.test_json_input)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['employee_id'], "DICT_001")

    def test_coverage_branches(self):
        """Test coverage for list JSON, fallback stdout save, missing file load fallback."""
        data = load_data("test_input.txt")
        with open("test_input.txt", "w") as f:
            f.write("test")
        data = load_data("test_input.txt")
        self.assertEqual(len(data), 0)
        results = run_proration(input_file="test_input.txt")
        self.assertEqual(results[0]["employee_id"], "DEFAULT_001")

        # List json
        with open(self.test_json_input, 'w') as f:
            json.dump([{"employee_id": "LIST_001"}], f)
        data = load_data(self.test_json_input)
        self.assertEqual(len(data), 1)

        # Non list/dict JSON
        with open(self.test_json_input, 'w') as f:
            json.dump("not_a_dict_or_list", f)
        data = load_data(self.test_json_input)
        self.assertEqual(len(data), 0)

        # Fallback stdout save
        # Pass a dir instead of file to trigger exception
        save_data([{"test": 1}], "/root/test_dir/")

        # Load non-existent file
        data = load_data("non_existent_file.json")
        self.assertEqual(data[0]['employee_id'], "DEFAULT_001")

        # Main empty argv fallback
        with patch.object(sys, 'argv', ['social_security_prorater_cli_one_click.py']):
            main()
        self.assertTrue(os.path.exists("proration_results.json"))

if __name__ == '__main__':
    unittest.main()

    def test_pipeline_coverage_branches(self):
        """Test coverage branches inside the embedded pipeline."""
        from ultra_modules.social_security_prorater_cli_one_click import SocialSecurityProraterBatchPipeline
        import datetime
        pipeline = SocialSecurityProraterBatchPipeline()

        # Test number fallback
        self.assertEqual(pipeline._clean_number("abcd"), 0.0)
        self.assertEqual(pipeline._clean_number(None, 5.0), 5.0)

        # Test date fallback
        self.assertIsNone(pipeline._parse_date("not a date"))
        self.assertEqual(pipeline._parse_date(datetime.date(2023, 1, 1)), datetime.date(2023, 1, 1))

        # Test calculate_active_days edge cases
        # onboard in future month
        active, days = pipeline._calculate_active_days(2023, 1, datetime.date(2023, 2, 1), None)
        self.assertEqual(active, 0)

        # offboard in past month
        active, days = pipeline._calculate_active_days(2023, 2, None, datetime.date(2023, 1, 31))
        self.assertEqual(active, 0)

        # process_record invalid target month
        res = pipeline.process_record({"target_month": "invalid_month"})
        self.assertEqual(res['status'], 'success')

        # Exception handling in process_record (by passing a mock that raises exception,
        # or by passing an incompatible type to bounded_base calculation)
        res2 = pipeline.process_record(None)
        self.assertEqual(res2['status'], 'error')
