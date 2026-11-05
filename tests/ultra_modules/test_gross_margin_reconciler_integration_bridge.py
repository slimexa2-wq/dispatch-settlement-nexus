import unittest
import decimal
from ultra_modules.gross_margin_reconciler_integration_bridge import GrossMarginReconcilerIntegrationBridge, reconcile_margin

class TestGrossMarginReconcilerIntegrationBridge(unittest.TestCase):

    def setUp(self):
        self.bridge = GrossMarginReconcilerIntegrationBridge()

    def test_normal_operation_new_schema(self):
        """Test normal operation with standard new schema keys"""
        data = {
            "invoice_amount": "10000.50",
            "equal_pay": "5000.25",
            "return_fee": "1000.00",
            "recruitment_commission": "500.00"
        }
        # Accounts Payable = 5000.25 + 1000.00 + 500.00 = 6500.25
        # Net Gross Margin = 10000.50 - 6500.25 = 3500.25
        result = reconcile_margin(data)

        self.assertEqual(result["invoice_amount"], "10000.50")
        self.assertEqual(result["equal_pay"], "5000.25")
        self.assertEqual(result["return_fee"], "1000.00")
        self.assertEqual(result["recruitment_commission"], "500.00")
        self.assertEqual(result["net_gross_margin"], "3500.25")

    def test_schema_backward_compatibility(self):
        """Test automatic mapping of old schema keys to new schema keys"""
        data = {
            "billed_amount": "12000.00", # maps to invoice_amount
            "worker_cost": "6000.00",    # maps to equal_pay
            "rebate": 1500,              # maps to return_fee
            "referral_fee": "600"        # maps to recruitment_commission
        }
        # Accounts Payable = 6000 + 1500 + 600 = 8100
        # Net Gross Margin = 12000 - 8100 = 3900
        result = reconcile_margin(data)

        self.assertEqual(result["invoice_amount"], "12000.00")
        self.assertEqual(result["equal_pay"], "6000.00")
        self.assertEqual(result["return_fee"], "1500.00")
        self.assertEqual(result["recruitment_commission"], "600.00")
        self.assertEqual(result["net_gross_margin"], "3900.00")

    def test_dirty_data_self_healing(self):
        """Test self-healing of dirty data (symbols, commas, weird spaces, float conversion issues)"""
        data = {
            "invoice_amount": " $ 15,000.75 ",
            "equal_pay": "¥7,500.50",
            "return_fee": 1200.25, # float
            "recruitment_commission": " ,800.00 "
        }
        # Invoice = 15000.75
        # Pay = 7500.50
        # Return = 1200.25
        # Comm = 800.00
        # Total payable = 9500.75
        # Net = 15000.75 - 9500.75 = 5500.00
        result = reconcile_margin(data)

        self.assertEqual(result["invoice_amount"], "15000.75")
        self.assertEqual(result["equal_pay"], "7500.50")
        self.assertEqual(result["return_fee"], "1200.25")
        self.assertEqual(result["recruitment_commission"], "800.00")
        self.assertEqual(result["net_gross_margin"], "5500.00")

    def test_missing_parameter_fallback(self):
        """Test fallback mechanisms when parameters are completely missing, None, or empty"""
        data = {
            "invoice_amount": "5000.00",
            # equal_pay is missing entirely
            "return_fee": None, # None value
            "recruitment_commission": "" # Empty string
        }
        # All missing/None/empty should default to 0.00
        # Invoice = 5000.00
        # Total payable = 0.00
        # Net = 5000.00
        result = reconcile_margin(data)

        self.assertEqual(result["invoice_amount"], "5000.00")
        self.assertEqual(result["equal_pay"], "0.00")
        self.assertEqual(result["return_fee"], "0.00")
        self.assertEqual(result["recruitment_commission"], "0.00")
        self.assertEqual(result["net_gross_margin"], "5000.00")

        # Test completely empty input
        result_empty = reconcile_margin()
        self.assertEqual(result_empty["net_gross_margin"], "0.00")

        # Test unexpected type for root input
        result_invalid_input = reconcile_margin("invalid_string_input")
        self.assertEqual(result_invalid_input["net_gross_margin"], "0.00")

    def test_extreme_edge_cases(self):
        """Test extreme edge cases like invalid text, unexpected data types, zero values"""
        data = {
            "invoice_amount": "Not a Number",
            "equal_pay": {"nested": "dict"}, # Unexpected object
            "return_fee": [1, 2, 3], # Unexpected array
            "recruitment_commission": 0 # Exact zero int
        }
        result = reconcile_margin(data)

        self.assertEqual(result["invoice_amount"], "0.00")
        self.assertEqual(result["equal_pay"], "0.00")
        self.assertEqual(result["return_fee"], "0.00")
        self.assertEqual(result["recruitment_commission"], "0.00")
        self.assertEqual(result["net_gross_margin"], "0.00")

    def test_audit_log(self):
        """Test that the silent audit log captures the process steps"""
        bridge = GrossMarginReconcilerIntegrationBridge()
        data = {
            "billed_amount": "100", # Old schema
            "equal_pay": "invalid", # Dirty data
            "return_fee": None      # Missing data
        }
        bridge.process(data)

        # Check that audit log has entries
        self.assertTrue(len(bridge.audit_log) > 0)

        # Check specific log messages exist in the log
        log_messages = [entry["message"] for entry in bridge.audit_log]

        # We mapped old schema field
        self.assertTrue(any("Mapped old schema field" in msg for msg in log_messages))
        # We handled invalid string
        self.assertTrue(any("Invalid string format" in msg for msg in log_messages))
        # We handled None
        self.assertTrue(any("Null value for" in msg for msg in log_messages))
        # We have a calculation complete entry
        self.assertTrue(any("Calculation complete" in msg for msg in log_messages))

if __name__ == '__main__':
    unittest.main()
