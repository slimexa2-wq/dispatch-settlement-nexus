import unittest
from ultra_modules.penny_exact_reimbursement_integration_bridge import PennyExactReimbursementIntegrationBridge

class TestPennyExactReimbursementIntegrationBridge(unittest.TestCase):
    def setUp(self):
        self.bridge = PennyExactReimbursementIntegrationBridge()

    def test_normal_operation(self):
        """Test case 1: Normal operation with standard data."""
        data = [
            {"invoice_no": "INV-001", "amount_yuan": 10.05},
            {"invoice_no": "INV-002", "amount_yuan": "100.50"}
        ]
        result = self.bridge.process_reimbursements(data)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["reimbursement_amount_cents"], 1005)
        self.assertEqual(result[1]["reimbursement_amount_cents"], 10050)

    def test_schema_version_compatibility(self):
        """Test case 2: Schema version auto-forward compatibility."""
        data = [
            {"invoiceNumber": "INV-OLD-1", "money": 5.25},
            {"invoice_id": "INV-NEW-1", "amount": 10},
            {"inv_no": "INV-LATEST", "reimbursement_amount": "0.99"}
        ]
        result = self.bridge.process_reimbursements(data)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["invoice_number"], "INV-OLD-1")
        self.assertEqual(result[0]["reimbursement_amount_cents"], 525)
        self.assertEqual(result[1]["invoice_number"], "INV-NEW-1")
        self.assertEqual(result[1]["reimbursement_amount_cents"], 1000)
        self.assertEqual(result[2]["invoice_number"], "INV-LATEST")
        self.assertEqual(result[2]["reimbursement_amount_cents"], 99)

    def test_dirty_data_self_healing(self):
        """Test case 3: Dirty data self-healing (strings, symbols, spaces in amounts)."""
        data = [
            {"invoice_no": "INV-DIRTY-1", "amount_yuan": " ¥ 1,000.50 "},
            {"invoice_no": "INV-DIRTY-2", "amount_yuan": "RMB 500.00"},
            {"invoice_no": "INV-DIRTY-3", "amount_yuan": ",,,"}, # invalid completely
        ]
        result = self.bridge.process_reimbursements(data)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["reimbursement_amount_cents"], 100050)
        self.assertEqual(result[1]["reimbursement_amount_cents"], 50000)
        self.assertEqual(result[2]["reimbursement_amount_cents"], 0)

    def test_missing_parameters_fallback(self):
        """Test case 4: Missing parameters default fallback (None, empty dicts, missing amounts)."""
        # Testing single dict instead of list, None, empty dict, missing amount
        self.assertEqual(self.bridge.process_reimbursements(None), [])

        result1 = self.bridge.process_reimbursements({"invoice_no": "INV-SINGLE", "amount": 1.23})
        self.assertEqual(len(result1), 1)
        self.assertEqual(result1[0]["reimbursement_amount_cents"], 123)

        result2 = self.bridge.process_reimbursements({})
        self.assertEqual(len(result2), 1)
        self.assertEqual(result2[0]["invoice_number"], "UNKNOWN_INVOICE")
        self.assertEqual(result2[0]["reimbursement_amount_cents"], 0)

    def test_extreme_edge_cases(self):
        """Test case 5: Extreme edge cases (duplicate invoices, negative amounts, zero amounts)."""
        data = [
            {"invoice_no": "INV-DUP", "amount_yuan": 50},
            {"invoice_no": "INV-DUP", "amount_yuan": 100}, # duplicate, should be dropped
            {"invoice_no": "INV-NEG", "amount_yuan": -10.50},
            {"invoice_no": "INV-ZERO", "amount_yuan": 0}
        ]
        result = self.bridge.process_reimbursements(data)
        # Dup is dropped, so len is 3
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]["invoice_number"], "INV-DUP")
        self.assertEqual(result[0]["reimbursement_amount_cents"], 5000)

        self.assertEqual(result[1]["invoice_number"], "INV-NEG")
        self.assertEqual(result[1]["reimbursement_amount_cents"], -1050)

        self.assertEqual(result[2]["invoice_number"], "INV-ZERO")
        self.assertEqual(result[2]["reimbursement_amount_cents"], 0)

if __name__ == '__main__':
    unittest.main()
