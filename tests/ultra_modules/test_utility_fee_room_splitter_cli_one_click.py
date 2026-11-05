import unittest
import json
from unittest.mock import patch
from io import StringIO
from ultra_modules.utility_fee_room_splitter_cli_one_click import UtilityFeeRoomSplitter, run_cli

class TestUtilityFeeRoomSplitter(unittest.TestCase):
    def test_normal_data(self):
        """Test normal calculation with valid data"""
        occupants = [
            {"name": "UserA", "days_stayed": 10},
            {"name": "UserB", "days_stayed": 20}
        ]
        splitter = UtilityFeeRoomSplitter(total_fee=300, occupants=occupants)
        res = splitter.calculate_split()

        self.assertEqual(res["status"], "success")
        self.assertEqual(res["total_fee"], 300)
        self.assertEqual(len(res["splits"]), 2)

        # UserA stayed 10/30 days = 1/3 of 300 = 100
        self.assertEqual(res["splits"][0]["amount"], 100.0)
        # UserB stayed 20/30 days = 2/3 of 300 = 200
        self.assertEqual(res["splits"][1]["amount"], 200.0)

    def test_dirty_data_self_healing(self):
        """Test dirty data healing"""
        occupants = [
            {"name": "UserA", "days_stayed": "invalid_string"},
            {"name": "", "days_stayed": -5},
            "not a dict at all",
            {"name": "UserC", "days_stayed": 15.5} # float heals to int
        ]
        splitter = UtilityFeeRoomSplitter(total_fee="abc", occupants=occupants) # total_fee dirty
        res = splitter.calculate_split()

        # total_fee heals to 0.0
        self.assertEqual(res["total_fee"], 0.0)
        # invalid_string heals to 0, -5 heals to 0, float 15.5 heals to 15.
        # "not a dict" is discarded.
        self.assertEqual(len(res["splits"]), 3)
        self.assertEqual(res["splits"][0]["days_stayed"], 0)
        self.assertEqual(res["splits"][1]["name"], "Unknown")
        self.assertEqual(res["splits"][1]["days_stayed"], 0)
        self.assertEqual(res["splits"][2]["days_stayed"], 15)

    def test_missing_parameters_fallback(self):
        """Test default fallbacks for missing parameters"""
        splitter = UtilityFeeRoomSplitter() # No parameters
        res = splitter.calculate_split()

        self.assertEqual(res["total_fee"], 0.0)
        self.assertEqual(res["status"], "error")
        self.assertEqual(res["splits"], [])

    def test_extreme_boundary_total_days_zero(self):
        """Test the edge case where total days stayed is zero but fee exists"""
        occupants = [
            {"name": "UserA", "days_stayed": 0},
            {"name": "UserB", "days_stayed": 0},
            {"name": "UserC", "days_stayed": 0}
        ]
        splitter = UtilityFeeRoomSplitter(total_fee=100, occupants=occupants)
        res = splitter.calculate_split()

        # Should split equally
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["splits"][0]["amount"], 33.33)
        self.assertEqual(res["splits"][1]["amount"], 33.33)
        self.assertEqual(res["splits"][2]["amount"], 33.34) # Remainder added to last

    def test_cli_execution_output(self):
        """Test the run_cli function runs without crashing and outputs JSON"""
        with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
            import sys
            # ensure no --excel in args
            original_argv = sys.argv
            sys.argv = ['test.py']
            run_cli()
            output = mock_stdout.getvalue()

            # Ensure it is valid JSON
            try:
                data = json.loads(output)
            except json.JSONDecodeError:
                self.fail("run_cli did not output valid JSON")

            self.assertEqual(data["status"], "success")
            self.assertEqual(data["total_fee"], 150.50)
            self.assertEqual(len(data["splits"]), 3)
            sys.argv = original_argv

    @patch('sys.argv', ['test.py', '--excel'])
    def test_cli_execution_excel_output(self):
        """Test the run_cli function outputs CSV/Excel report"""
        import os
        filename = "utility_fee_split_result.csv"
        # ensure file does not exist before
        if os.path.exists(filename):
            os.remove(filename)

        with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
            run_cli()
            output = mock_stdout.getvalue()
            self.assertIn(f"Excel/CSV report successfully generated: {filename}", output)
            self.assertTrue(os.path.exists(filename))

            # Verify file content
            with open(filename, 'r', encoding='utf-8-sig') as f:
                content = f.read()
                self.assertIn("Alice", content)
                self.assertIn("100.33", content)

            # cleanup
            os.remove(filename)

if __name__ == '__main__':
    unittest.main()
