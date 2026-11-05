import unittest
import decimal
from ultra_modules.gross_margin_reconciler_audit_trace import GrossMarginReconcilerAuditTrace

class TestGrossMarginReconcilerAuditTrace(unittest.TestCase):
    def setUp(self):
        self.reconciler = GrossMarginReconcilerAuditTrace()

    def test_normal_operation(self):
        """Test with standard integer and float inputs."""
        result = self.reconciler.reconcile_and_compare(
            invoice_amount=10000,
            equal_pay=4000,
            return_fee=1000,
            recruitment_commission=500,
            expected_margin=4500
        )

        recon = result["reconciliation_result"]
        self.assertEqual(recon["calculated"], "4500")
        self.assertEqual(recon["expected"], "4500")
        self.assertEqual(recon["difference"], "0")
        self.assertTrue(recon["match"])
        self.assertFalse(recon["highlight_discrepancy"])

        # Verify trace contains start, end, and compare logs
        trace = result["_audit_trace"]
        self.assertTrue(any(t["action"] == "CALCULATION_START" for t in trace))
        self.assertTrue(any(t["action"] == "CALCULATION_END" for t in trace))
        self.assertTrue(any(t["action"] == "RECONCILIATION_COMPARE" for t in trace))

    def test_missing_parameters_fallback(self):
        """Test with missing parameters to ensure zero defaults are applied."""
        result = self.reconciler.reconcile_and_compare(
            invoice_amount=100
        )

        recon = result["reconciliation_result"]
        self.assertEqual(recon["calculated"], "100")
        self.assertEqual(recon["expected"], "0")
        self.assertEqual(recon["difference"], "100")
        self.assertFalse(recon["match"])
        self.assertTrue(recon["highlight_discrepancy"])

    def test_dirty_data_self_healing(self):
        """Test handling of None, strings with commas, empty strings."""
        result = self.reconciler.reconcile_and_compare(
            invoice_amount="10,000.50",
            equal_pay="   ", # Empty string after strip
            return_fee=None,
            recruitment_commission="1,000",
            expected_margin="9000.50"
        )

        recon = result["reconciliation_result"]
        self.assertEqual(recon["calculated"], "9000.50")
        self.assertEqual(recon["expected"], "9000.50")
        self.assertTrue(recon["match"])

        # Verify healing was traced
        trace = result["_audit_trace"]
        healing_events = [t for t in trace if t["action"] == "DATA_HEALING"]
        self.assertTrue(len(healing_events) > 0)

    def test_invalid_data_fallback(self):
        """Test handling of completely invalid types (should fallback to 0)."""
        result = self.reconciler.reconcile_and_compare(
            invoice_amount=1000,
            equal_pay={"invalid": "dict"},
            return_fee=[1, 2, 3],
            recruitment_commission=object(),
            expected_margin=1000
        )

        recon = result["reconciliation_result"]
        self.assertEqual(recon["calculated"], "1000") # Everything else should be 0
        self.assertTrue(recon["match"])

        trace = result["_audit_trace"]
        fallback_events = [t for t in trace if t["action"] == "PARSE_ERROR_FALLBACK"]
        self.assertTrue(len(fallback_events) >= 3)

    def test_extreme_edge_cases(self):
        """Test with negative numbers and very large numbers."""
        large_invoice = "999999999999999999.99"
        negative_pay = "-500.50"

        result = self.reconciler.reconcile_and_compare(
            invoice_amount=large_invoice,
            equal_pay=negative_pay,
            expected_margin="1000000000000000500.49" # Invoice - (-500.50)
        )

        recon = result["reconciliation_result"]
        self.assertEqual(recon["calculated"], "1000000000000000500.49")
        self.assertTrue(recon["match"])

if __name__ == '__main__':
    unittest.main()
