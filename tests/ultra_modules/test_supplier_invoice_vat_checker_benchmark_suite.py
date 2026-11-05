import unittest
import math
from ultra_modules.supplier_invoice_vat_checker_benchmark_suite import (
    InvoiceVatChecker,
    SyntheticFixtureGenerator,
    VALID_VAT_RATES
)

class TestInvoiceVatChecker(unittest.TestCase):

    def test_normal_operation(self):
        """Test normal invoice scenarios with common valid VAT rates."""
        invoice = {
            "invoice_id": "INV-001",
            "amount": 1060.0,
            "tax_rate": 0.06,
            "date": "2023-10-15"
        }
        result = InvoiceVatChecker.check_invoice(invoice)
        self.assertEqual(result["original_amount"], 1060.0)
        self.assertEqual(result["applied_tax_rate"], 0.06)
        self.assertTrue(result["is_compliant"])
        # Deduction: (1060 / 1.06) * 0.06 = 60.0
        self.assertAlmostEqual(result["deduction_amount"], 60.0, places=2)

    def test_missing_parameter_fallback(self):
        """Test missing parameter default fallbacks."""
        # Test empty dict
        result = InvoiceVatChecker.check_invoice({})
        self.assertEqual(result["original_amount"], 0.0)
        self.assertEqual(result["applied_tax_rate"], 0.0)
        self.assertFalse(result["is_compliant"])
        self.assertEqual(result["deduction_amount"], 0.0)

        # Test completely invalid input type
        result2 = InvoiceVatChecker.check_invoice(None)
        self.assertEqual(result2["original_amount"], 0.0)
        self.assertIsNotNone(result2["invoice_id"])
        self.assertEqual(result2["invoice_date"], "1970-01-01")

    def test_dirty_data_self_healing(self):
        """Test dirty data like strings for numbers, NaN, and negative amounts."""
        invoice = {
            "invoice_id": None,
            "amount": "1,030.00",
            "tax_rate": "3%",
            "date": 12345 # Invalid date type
        }
        result = InvoiceVatChecker.check_invoice(invoice)
        self.assertEqual(result["original_amount"], 1030.0)
        self.assertEqual(result["applied_tax_rate"], 0.03)
        self.assertTrue(result["is_compliant"])
        self.assertEqual(result["invoice_date"], "1970-01-01")
        # (1030 / 1.03) * 0.03 = 30.0
        self.assertAlmostEqual(result["deduction_amount"], 30.0, places=2)

        # Test NaNs and Inf
        invoice2 = {
            "amount": float('nan'),
            "tax_rate": float('inf'),
            "date": "2024-01-01"
        }
        result2 = InvoiceVatChecker.check_invoice(invoice2)
        self.assertEqual(result2["original_amount"], 0.0)
        self.assertEqual(result2["applied_tax_rate"], 0.0)
        self.assertFalse(result2["is_compliant"])
        self.assertEqual(result2["deduction_amount"], 0.0)

        # Test Negative values and Gibberish strings
        invoice3 = {
            "amount": -500,
            "tax_rate": "gibberish",
            "date": "   "
        }
        result3 = InvoiceVatChecker.check_invoice(invoice3)
        self.assertEqual(result3["original_amount"], 0.0)
        self.assertEqual(result3["applied_tax_rate"], 0.0)
        self.assertFalse(result3["is_compliant"])
        self.assertEqual(result3["invoice_date"], "1970-01-01")

    def test_extreme_boundaries(self):
        """Test extreme boundaries like very large amounts."""
        invoice = {
            "amount": 999999999999.99,
            "tax_rate": 0.01,
            "date": "2024-02-29" # Valid leap year
        }
        result = InvoiceVatChecker.check_invoice(invoice)
        self.assertEqual(result["original_amount"], 999999999999.99)
        self.assertEqual(result["applied_tax_rate"], 0.01)
        self.assertTrue(result["is_compliant"])
        expected_deduction = (999999999999.99 / 1.01) * 0.01
        self.assertAlmostEqual(result["deduction_amount"], round(expected_deduction, 2), places=2)

        # Another test for 5% tax rate and integer rate like 5 instead of 0.05
        invoice2 = {
            "amount": "￥105",
            "tax_rate": 5, # Should be converted to 0.05
            "date": "2023-02-29" # Invalid leap year, but we only check for string presence currently
        }
        result2 = InvoiceVatChecker.check_invoice(invoice2)
        self.assertEqual(result2["original_amount"], 105.0)
        self.assertEqual(result2["applied_tax_rate"], 0.05)
        self.assertTrue(result2["is_compliant"])
        self.assertAlmostEqual(result2["deduction_amount"], 5.0, places=2)

    def test_benchmark_and_batch_processing(self):
        """Test processing of a large synthetic dataset to ensure 0 crashes."""
        # 10k items
        benchmark_results = SyntheticFixtureGenerator.run_benchmark(10000)
        self.assertEqual(benchmark_results["dataset_size"], 10000)
        self.assertGreater(benchmark_results["throughput_per_sec"], 0)

        # Test process batch explicitly with non-list
        empty_res = InvoiceVatChecker.process_batch(None)
        self.assertEqual(empty_res, [])

if __name__ == "__main__":
    unittest.main()
