import unittest
import time
from ultra_modules.penny_exact_reimbursement_self_healing_guard import PennyExactReimbursementGuard

class TestPennyExactReimbursementGuard(unittest.TestCase):
    def setUp(self):
        self.guard = PennyExactReimbursementGuard()

    def test_happy_path(self):
        req = {
            "process_id": "req-1",
            "amount": 100.55,
            "invoice_no": "INV-1001"
        }
        res = self.guard.process_reimbursement(req)

        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["cents_amount"], 10055)
        self.assertEqual(res["invoice_no"], "INV-1001")
        self.assertIn("INV-1001", self.guard.processed_invoices)

    def test_dirty_data_self_healing(self):
        req_dirty = {
            "process_id": "req-2",
            "amount": "  $ 1,234.56  ",
            "invoice_no": "  INV-1002  "
        }
        res = self.guard.process_reimbursement(req_dirty)

        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["cents_amount"], 123456)
        self.assertEqual(res["invoice_no"], "INV-1002")
        self.assertIn("INV-1002", self.guard.processed_invoices)

    def test_missing_parameter_fallback_defaults(self):
        req_missing = {}
        res = self.guard.process_reimbursement(req_missing)

        self.assertEqual(res["status"], "FAILED_INVALID_FORMAT")
        self.assertEqual(res["cents_amount"], 0)
        self.assertIsNone(res["invoice_no"])
        self.assertIsNotNone(res["process_id"])

    def test_undo_behavior(self):
        req = {
            "process_id": "req-undo",
            "amount": 50.00,
            "invoice_no": "INV-UNDO"
        }
        # First process it
        self.guard.process_reimbursement(req)
        self.assertIn("INV-UNDO", self.guard.processed_invoices)

        # Now undo
        success, msg = self.guard.undo("req-undo")
        self.assertTrue(success)
        self.assertEqual(msg, "UNDO_SUCCESS")
        self.assertNotIn("INV-UNDO", self.guard.processed_invoices)

        # Test expired undo (mock time)
        req_expired = {
            "process_id": "req-expired",
            "amount": 10.00,
            "invoice_no": "INV-EXPIRED"
        }
        self.guard.process_reimbursement(req_expired)

        original_time = time.time
        try:
            time.time = lambda: original_time() + 6.0
            success, msg = self.guard.undo("req-expired")
            self.assertFalse(success)
            self.assertEqual(msg, "UNDO_EXPIRED")
            self.assertIn("INV-EXPIRED", self.guard.processed_invoices)
        finally:
            time.time = original_time

    def test_extreme_boundary_cases(self):
        # Negative amount
        req_neg = {
            "process_id": "req-neg",
            "amount": -50.00,
            "invoice_no": "INV-NEG"
        }
        res = self.guard.process_reimbursement(req_neg)
        self.assertEqual(res["cents_amount"], 0)

        # Very large float, scientific notation as string
        req_large = {
            "process_id": "req-large",
            "amount": "1e9",
            "invoice_no": "INV-LARGE"
        }
        res = self.guard.process_reimbursement(req_large)
        self.assertEqual(res["cents_amount"], 100000000000)

        # Invalid invoice types
        req_invalid_inv = {
            "process_id": "req-inv-type",
            "amount": 10,
            "invoice_no": 12345
        }
        res = self.guard.process_reimbursement(req_invalid_inv)
        self.assertEqual(res["status"], "FAILED_INVALID_FORMAT")
