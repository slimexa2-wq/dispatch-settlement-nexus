import unittest
import time
from decimal import Decimal
from ultra_modules.penny_exact_reimbursement_batch_pipeline import ReimbursementBatchPipeline, process_reimbursements_batch

class TestReimbursementBatchPipeline(unittest.TestCase):
    def setUp(self):
        # Always create a fresh pipeline instance for each test so global state doesn't interfere
        self.pipeline = ReimbursementBatchPipeline(max_workers=5)

    def test_normal_batch_processing(self):
        """Test normal case with a valid batch of reimbursements."""
        records = [
            {"id": "t1", "amount": 10.50, "invoice_no": "INV-001"},
            {"id": "t2", "amount": "20.99", "invoice_no": "INV-002"},
            {"id": "t3", "amount": Decimal('30.01'), "invoice_no": "INV-003"}
        ]

        result = self.pipeline.process_sync(records)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["successful"], 3)
        self.assertEqual(result["failed"], 0)

        cents_mapping = {r["invoice_no"]: r["cents"] for r in result["results"]}
        self.assertEqual(cents_mapping["INV-001"], 1050)
        self.assertEqual(cents_mapping["INV-002"], 2099)
        self.assertEqual(cents_mapping["INV-003"], 3001)

    def test_dirty_data_auto_recovery(self):
        """Test dirty data auto-recovery (invalid amount, negative amount)."""
        records = [
            {"id": "dirty1", "amount": "invalid_string", "invoice_no": "INV-DIRTY-1"},
            {"id": "dirty2", "amount": -15.50, "invoice_no": "INV-DIRTY-2"},
            {"id": "dirty3", "amount": None, "invoice_no": "INV-DIRTY-3"}
        ]

        result = self.pipeline.process_sync(records)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["successful"], 3)

        for r in result["results"]:
            # All dirty amounts should fallback to 0 cents
            self.assertEqual(r["cents"], 0)

    def test_missing_parameters_fallback(self):
        """Test missing parameters fallback (e.g. invoice_no missing)."""
        records = [
            {"id": "miss1", "amount": 5.0},
            {"id": "miss2"} # Missing amount and invoice_no
        ]

        result = self.pipeline.process_sync(records)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["successful"], 2)

        # Check auto-generated invoice numbers
        for r in result["results"]:
            self.assertTrue(r["invoice_no"].startswith("AUTO-INV-"))
            if r["id"] == "miss1":
                self.assertEqual(r["cents"], 500)
            elif r["id"] == "miss2":
                self.assertEqual(r["cents"], 0)

    def test_duplicate_invoice_prevention(self):
        """Test duplicate invoice prevention."""
        records = [
            {"id": "dup1", "amount": 100, "invoice_no": "INV-DUP-01"},
            {"id": "dup2", "amount": 200, "invoice_no": "INV-DUP-01"},
            {"id": "dup3", "amount": 300, "invoice_no": "INV-DUP-02"}
        ]

        result = self.pipeline.process_sync(records)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["total"], 3)

        # Only 2 successful, 1 failed (duplicate)
        self.assertEqual(result["successful"], 2)
        self.assertEqual(result["failed"], 1)

        statuses = [r["status"] for r in result["results"]]
        self.assertEqual(statuses.count("success"), 2)
        self.assertEqual(statuses.count("duplicate_invoice"), 1)

    def test_extreme_boundaries(self):
        """Test extreme boundaries (max float limits, precision loss cases)."""
        records = [
            # Potential float precision loss cases
            {"id": "ext1", "amount": 10.1234, "invoice_no": "INV-EXT-1"},
            {"id": "ext2", "amount": "99999999999.99", "invoice_no": "INV-EXT-2"},
            {"id": "ext3", "amount": 0.001, "invoice_no": "INV-EXT-3"}
        ]

        result = self.pipeline.process_sync(records)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["successful"], 3)

        cents_mapping = {r["invoice_no"]: r["cents"] for r in result["results"]}
        # 10.1234 -> 1012 cents
        self.assertEqual(cents_mapping["INV-EXT-1"], 1012)
        # 99999999999.99 -> 9999999999999 cents
        self.assertEqual(cents_mapping["INV-EXT-2"], 9999999999999)
        # 0.001 -> 0 cents
        self.assertEqual(cents_mapping["INV-EXT-3"], 0)

    def test_batch_async_submission(self):
        """Test asynchronous batch submission and progress snapshot retrieval."""
        # Generate 100 records
        records = [{"id": f"async{i}", "amount": i, "invoice_no": f"INV-ASYNC-{i}"} for i in range(100)]

        job_id = self.pipeline.submit_batch(records)
        self.assertTrue(isinstance(job_id, str))

        # Poll progress
        completed = False
        for _ in range(50): # Wait max ~2.5s
            snapshot = self.pipeline.get_progress_snapshot(job_id)
            if snapshot["status"] == "completed":
                completed = True
                self.assertEqual(snapshot["total"], 100)
                self.assertEqual(snapshot["successful"], 100)
                self.assertEqual(snapshot["failed"], 0)
                break
            time.sleep(0.05)

        self.assertTrue(completed, "Batch did not complete in time")

if __name__ == '__main__':
    unittest.main()
