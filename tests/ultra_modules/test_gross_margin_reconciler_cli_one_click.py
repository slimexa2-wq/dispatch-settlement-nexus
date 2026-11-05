import unittest
import sys
import io
import json
from ultra_modules.gross_margin_reconciler_cli_one_click import GrossMarginReconciler, run_cli_one_click

class TestGrossMarginReconcilerCliOneClick(unittest.TestCase):
    def test_normal_flow(self):
        """Test with valid normal data."""
        data = [
            {"project": "Proj 1", "revenue": 100, "base_pay": 50, "rebate": 10, "commission": 5},
            {"project": "Proj 2", "revenue": 200, "base_pay": 100, "rebate": 20, "commission": 10},
        ]
        reconciler = GrossMarginReconciler(data)
        result = reconciler.reconcile()

        self.assertEqual(len(result["details"]), 2)
        self.assertEqual(result["summary"]["total_revenue"], 300)
        self.assertEqual(result["summary"]["total_payables"], 195)
        self.assertEqual(result["summary"]["total_margin"], 105)

        self.assertEqual(result["details"][0]["margin"], 100 - (50 + 10 + 5))
        self.assertEqual(result["details"][1]["margin"], 200 - (100 + 20 + 10))

        # Test JSON and Excel (CSV) exports
        json_output = json.loads(reconciler.export_json())
        self.assertEqual(json_output["summary"]["total_margin"], 105)

        excel_output = reconciler.export_excel()
        self.assertIn("Proj 1,100.0,65.0,35.0", excel_output)
        self.assertIn("Proj 2,200.0,130.0,70.0", excel_output)
        self.assertIn("300.0,195.0,105.0", excel_output)

    def test_dirty_data_self_healing(self):
        """Test with dirty data: invalid types, invalid strings."""
        data = [
            # Strings instead of numbers, invalid numbers, missing project
            {"revenue": "100", "base_pay": "50", "rebate": "not a number", "commission": None},
            # Completely invalid row
            "this is a string, not a dict",
            # Empty dict
            {},
        ]
        reconciler = GrossMarginReconciler(data)
        result = reconciler.reconcile()

        self.assertEqual(len(result["details"]), 2)

        # Row 0: revenue=100.0, base_pay=50.0, rebate=0.0 (self-healed), commission=0.0 (self-healed)
        self.assertEqual(result["details"][0]["revenue"], 100.0)
        self.assertEqual(result["details"][0]["payables"], 50.0)
        self.assertEqual(result["details"][0]["margin"], 50.0)
        self.assertEqual(result["details"][0]["project"], "Unknown Project")

        # Row 1 (was Row 2): Empty dict -> all 0, project unknown
        self.assertEqual(result["details"][1]["revenue"], 0.0)
        self.assertEqual(result["details"][1]["payables"], 0.0)
        self.assertEqual(result["details"][1]["margin"], 0.0)

    def test_missing_parameters_fallback(self):
        """Test default instantiation and fallback for missing parameters."""
        # Zero-config default instantiation
        reconciler_empty = GrossMarginReconciler()
        res_empty = reconciler_empty.reconcile()
        self.assertEqual(res_empty["summary"]["total_revenue"], 0.0)
        self.assertEqual(len(res_empty["details"]), 0)

        # Partially missing keys in data dict
        data = [{"revenue": 500}] # missing base_pay, rebate, commission, project
        reconciler = GrossMarginReconciler(data)
        res = reconciler.reconcile()
        self.assertEqual(res["details"][0]["project"], "Unknown Project")
        self.assertEqual(res["details"][0]["revenue"], 500.0)
        self.assertEqual(res["details"][0]["payables"], 0.0)
        self.assertEqual(res["details"][0]["margin"], 500.0)

    def test_extreme_boundaries(self):
        """Test with very large numbers, negative numbers, and float precisions."""
        data = [
            {"project": "Big", "revenue": 1e12, "base_pay": 5e11, "rebate": -1000, "commission": 0.12345},
        ]
        reconciler = GrossMarginReconciler(data)
        result = reconciler.reconcile()

        revenue = 1e12
        payable = 5e11 - 1000 + 0.12345
        expected_margin = revenue - payable

        self.assertAlmostEqual(result["summary"]["total_margin"], expected_margin, places=4)

    def test_cli_default_behavior(self):
        """Test that the one-click CLI runs without errors and outputs default data."""
        captured_output = io.StringIO()
        sys.stdout = captured_output
        try:
            run_cli_one_click()
        finally:
            sys.stdout = sys.__stdout__

        output = captured_output.getvalue()

        # Should contain JSON structure and Excel (CSV) text
        self.assertIn("--- JSON Output ---", output)
        self.assertIn("--- Excel (CSV) Output ---", output)
        self.assertIn("Project A", output)
        self.assertIn("Project A,10000.0,6500.0,3500.0", output)

if __name__ == "__main__":
    unittest.main()
