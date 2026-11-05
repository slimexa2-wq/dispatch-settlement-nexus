import unittest
from ultra_modules.gross_margin_reconciler_core_engine import calculate_gross_margin, _safe_float

class TestGrossMarginReconcilerCoreEngine(unittest.TestCase):

    def test_safe_float_cleaning(self):
        """Test the internal data cleaner _safe_float."""
        self.assertEqual(_safe_float(None), 0.0)
        self.assertEqual(_safe_float(""), 0.0)
        self.assertEqual(_safe_float("   "), 0.0)
        self.assertEqual(_safe_float("1,000.50"), 1000.50)
        self.assertEqual(_safe_float("100"), 100.0)
        self.assertEqual(_safe_float(100.5), 100.5)
        self.assertEqual(_safe_float(100), 100.0)
        self.assertEqual(_safe_float("invalid"), 0.0)
        self.assertEqual(_safe_float({}), 0.0)
        self.assertEqual(_safe_float([]), 0.0)

    def test_calculate_gross_margin_normal(self):
        """Test case 1: Normal calculation."""
        # 10000 - 5000 - 1000 - 500 = 3500
        result = calculate_gross_margin(
            invoice_amount=10000.0,
            equal_pay=5000.0,
            return_fee=1000.0,
            recruitment_commission=500.0
        )
        self.assertEqual(result, 3500.0)

    def test_calculate_gross_margin_dirty_data_healing(self):
        """Test case 2: Dirty data auto-healing (e.g. strings, commas, invalid chars)."""
        # "10,000.5" - "5,000" - "invalid" - None = 5000.5
        result = calculate_gross_margin(
            invoice_amount="10,000.5",
            equal_pay="  5,000  ",
            return_fee="invalid",
            recruitment_commission=None
        )
        self.assertEqual(result, 5000.5)

    def test_calculate_gross_margin_missing_parameters(self):
        """Test case 3: Missing parameter default fallbacks."""
        # Using default values (0.0) for missing kwargs
        # 10000 - 0 - 0 - 0 = 10000
        result = calculate_gross_margin(invoice_amount=10000.0)
        self.assertEqual(result, 10000.0)

        # All default
        result2 = calculate_gross_margin()
        self.assertEqual(result2, 0.0)

    def test_calculate_gross_margin_extreme_boundary_limits(self):
        """Test case 4: Extreme boundary limits (huge numbers, negative results)."""
        # Large floats
        result = calculate_gross_margin(
            invoice_amount=1e9,
            equal_pay=1e8,
            return_fee=1e8,
            recruitment_commission=1e8
        )
        self.assertEqual(result, 700000000.0)

        # Negative net gross margin scenario
        result2 = calculate_gross_margin(
            invoice_amount=100.0,
            equal_pay=500.0,
            return_fee=0.0,
            recruitment_commission=0.0
        )
        self.assertEqual(result2, -400.0)

    def test_calculate_gross_margin_precision(self):
        """Test case 5: Floating point precision rounding."""
        # 10.123 - 2.1 - 1.01 - 0.003 = 7.01
        result = calculate_gross_margin(
            invoice_amount=10.123,
            equal_pay=2.1,
            return_fee=1.01,
            recruitment_commission=0.003
        )
        self.assertEqual(result, 7.01)

if __name__ == "__main__":
    unittest.main()
