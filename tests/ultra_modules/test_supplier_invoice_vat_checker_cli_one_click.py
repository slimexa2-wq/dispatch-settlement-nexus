import unittest
import os
import json
import csv
from unittest.mock import patch
from io import StringIO
import tempfile
import sys

from ultra_modules.supplier_invoice_vat_checker_cli_one_click import OneClickVatCheckerCLI, main

class TestSupplierInvoiceVatCheckerCLI(unittest.TestCase):

    def setUp(self):
        # Create a temporary directory for output files
        self.test_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        # Cleanup temporary directory
        self.test_dir.cleanup()

    def test_normal_case_json_output(self):
        """Test Case 1: Normal case with JSON output"""
        result_json = OneClickVatCheckerCLI.run(
            invoice_type="专票",
            amount=10000.0,
            tax_rate=6.0,
            differential_deduction=0.0,
            output_format="json"
        )

        # Check if output is a valid JSON string
        data = json.loads(result_json)
        self.assertEqual(data["invoice_type"], "专票")
        self.assertEqual(data["amount_inclusive"], 10000.0)
        self.assertEqual(data["tax_rate_pct"], 6.0)
        self.assertTrue(data["is_compliant"])
        self.assertIn("deductible_vat", data)

    def test_normal_case_excel_csv_output(self):
        """Test Case 2: Normal case with Excel/CSV output"""
        csv_path = os.path.join(self.test_dir.name, "test_output.csv")
        result = OneClickVatCheckerCLI.run(
            invoice_type="普票",
            amount=20000.0,
            tax_rate=3.0,
            differential_deduction=0.0,
            output_format="csv",
            output_path=csv_path
        )

        self.assertIn("Result saved to", result)
        self.assertTrue(os.path.exists(csv_path))

        # Verify CSV content
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            self.assertEqual(len(rows), 1)
            row = rows[0]
            self.assertEqual(row["invoice_type"], "普票")
            self.assertEqual(float(row["amount_inclusive"]), 20000.0)
            self.assertEqual(float(row["tax_rate_pct"]), 3.0)
            self.assertEqual(float(row["deductible_vat"]), 0.0)  # General invoice has 0 deductible VAT

    def test_missing_parameters_default_behavior(self):
        """Test Case 3: Missing parameters (one-click default behavior)"""
        # Testing CLI zero-parameter behavior through argparse
        test_args = ["supplier_invoice_vat_checker_cli_one_click.py"]
        with patch.object(sys, 'argv', test_args):
            with patch('sys.stdout', new_callable=StringIO) as mock_stdout:
                main()

                output = mock_stdout.getvalue()
                data = json.loads(output)

                # Should use defaults: 专票, 10000.0, 6.0, 0.0
                self.assertEqual(data["invoice_type"], "专票")
                self.assertEqual(data["amount_inclusive"], 10000.0)
                self.assertEqual(data["tax_rate_pct"], 6.0)
                self.assertEqual(data["differential_deduction"], 0.0)

    def test_dirty_data_and_file_output_boundary(self):
        """Test Case 4: Dirty data and file output boundary cases"""
        # Sending dirty string data where numbers are expected
        # And testing missing directory for CSV output to verify fallback behavior
        bad_csv_path = "/this_directory_should_not_exist_or_be_writable/bad_output.csv"

        result = OneClickVatCheckerCLI.run(
            invoice_type="混杂专票123",
            amount="abc10000.00def",
            tax_rate="rate_is_0.06",
            differential_deduction=True,
            output_format="excel",
            output_path=bad_csv_path
        )

        # It should catch the file write exception and return a failure message
        self.assertTrue(result.startswith("Failed to save to"))

        # Check JSON fallback output if no path was provided but dirty data is passed
        json_result = OneClickVatCheckerCLI.run(
            invoice_type="混杂专票123",
            amount="abc10000.00def",
            tax_rate="rate_is_0.06",
            differential_deduction=True,
            output_format="json"
        )

        data = json.loads(json_result)
        # Should be auto-healed by the core engine
        self.assertEqual(data["invoice_type"], "专票")  # Because it contains "专"
        self.assertEqual(data["amount_inclusive"], 10000.0)
        self.assertEqual(data["tax_rate_pct"], 6.0)  # Core heals invalid tax rate to closest valid one (6.0 is default fallback here or it matches 6)
        # Since tax_rate_pct is 6.0, actual_diff_deduction will be set to 0.0 by the core engine (only applies to 5.0%)
        self.assertEqual(data["differential_deduction"], 0.0)

    def test_extreme_boundary_limits(self):
        """Test Case 5: Extreme boundary limits (5% differential deduction logic)"""
        # Testing 5% differential tax rate where differential deduction > amount
        result_json = OneClickVatCheckerCLI.run(
            invoice_type="专票",
            amount=5000.0,
            tax_rate=5.0,
            differential_deduction=10000.0, # Exceeds amount
            output_format="json"
        )

        data = json.loads(result_json)
        # Core engine should self-heal differential_deduction to 0.0 if > amount
        self.assertEqual(data["differential_deduction"], 0.0)
        self.assertEqual(data["tax_rate_pct"], 5.0)

        # Testing negative amounts
        result_json2 = OneClickVatCheckerCLI.run(
            invoice_type="普票",
            amount=-5000.0,
            tax_rate=5.0,
            differential_deduction=-1000.0,
            output_format="json"
        )

        data2 = json.loads(result_json2)
        # Core engine should heal negative values to 0.0
        self.assertEqual(data2["amount_inclusive"], 0.0)
        self.assertEqual(data2["differential_deduction"], 0.0)

if __name__ == '__main__':
    unittest.main()
