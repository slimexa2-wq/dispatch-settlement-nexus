import unittest
import time
from datetime import datetime, timedelta
from ultra_modules.CrossMonthDuplicateGuard_self_healing_guard import CrossMonthDuplicateGuard

class TestCrossMonthDuplicateGuard(unittest.TestCase):
    def setUp(self):
        self.guard = CrossMonthDuplicateGuard()

    def test_normal_claim_approval(self):
        # 1. Normal claim approval without history
        result = self.guard.process_claim(
            worker_id="W001",
            project_id="P001",
            claim_date="2023-01-01",
            amount=100.0
        )
        self.assertEqual(result["status"], "approved")
        self.assertEqual(result["processed_data"]["worker_id"], "W001")
        self.assertEqual(result["processed_data"]["project_id"], "P001")
        self.assertEqual(result["processed_data"]["amount"], 100.0)

    def test_silent_interception_duplicate_within_3_months(self):
        # 2. Silent interception of duplicate claims within 3 months
        # First claim
        self.guard.process_claim(worker_id="W002", project_id="P002", claim_date="2023-01-01", amount=100.0)

        # Second claim within 90 days
        result = self.guard.process_claim(worker_id="W002", project_id="P002", claim_date="2023-03-01", amount=200.0)
        self.assertEqual(result["status"], "intercepted")
        self.assertIn("Intercepted", result["message"])

    def test_dirty_data_self_healing(self):
        # 3. Dirty data self-healing (missing IDs, messy date formats, non-numeric amounts)
        result = self.guard.process_claim(
            worker_id=None,
            project_id="  p003  ",
            claim_date="2023/05/15",
            amount="invalid_amount"
        )
        self.assertEqual(result["status"], "approved")
        self.assertEqual(result["processed_data"]["worker_id"], "UNKNOWN")
        self.assertEqual(result["processed_data"]["project_id"], "P003")
        self.assertEqual(result["processed_data"]["claim_date"], "2023-05-15 00:00:00")
        self.assertEqual(result["processed_data"]["amount"], 0.0)

    def test_claims_outside_3_months(self):
        # 4. Claims outside the 3-month (90-day) window are approved
        self.guard.process_claim(worker_id="W004", project_id="P004", claim_date="2023-01-01", amount=100.0)

        # Claim after 100 days
        result = self.guard.process_claim(worker_id="W004", project_id="P004", claim_date="2023-04-12", amount=150.0)
        self.assertEqual(result["status"], "approved")

    def test_one_click_undo_mechanism(self):
        # 5. One-click Undo mechanism testing (success within 5 secs, failure after expiry)
        # Process a claim
        result = self.guard.process_claim(worker_id="W005", project_id="P005", claim_date="2023-01-01", amount=100.0)
        undo_id = result["undo_id"]

        # Undo immediately
        undo_result = self.guard.undo(undo_id)
        self.assertEqual(undo_result["status"], "success")

        # The record should be removed, so a new claim on the same date should be approved
        new_result = self.guard.process_claim(worker_id="W005", project_id="P005", claim_date="2023-01-02", amount=100.0)
        self.assertEqual(new_result["status"], "approved")

        # Test expiration
        self.guard.UNDO_WINDOW = 0.1 # Temporarily reduce window for test
        undo_id2 = new_result["undo_id"]
        time.sleep(0.2)
        undo_result_expired = self.guard.undo(undo_id2)
        self.assertEqual(undo_result_expired["status"], "failed")
        self.assertEqual(undo_result_expired["message"], "Undo window expired")

if __name__ == '__main__':
    unittest.main()
