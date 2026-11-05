import unittest
import time
from ultra_modules.gross_margin_reconciler_batch_pipeline import GrossMarginReconciler, BatchPipeline, run_pipeline

class TestGrossMarginReconcilerBatchPipeline(unittest.TestCase):

    def test_normal_record(self):
        # 1. Normal data
        record = {
            "id": "1",
            "receivable_billing": 10000,
            "equal_pay": 5000,
            "rebate": 1000,
            "commission": 500
        }
        result = GrossMarginReconciler.process_record(record)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["net_gross_margin"], 3500) # 10000 - 6500

    def test_missing_params_fallback(self):
        # 2. Missing parameters with default fallback
        record = {
            "id": "2",
            "receivable_billing": 8000
            # missing equal_pay, rebate, commission
        }
        result = GrossMarginReconciler.process_record(record)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["payable"], 0.0)
        self.assertEqual(result["net_gross_margin"], 8000)

    def test_dirty_data_self_healing(self):
        # 3. Dirty data self-healing
        record = {
            "id": "3",
            "receivable_billing": "10000.5", # string number
            "equal_pay": "invalid_number", # invalid, should be 0.0
            "rebate": None, # None, should be 0.0
            "commission": {"key": "value"} # dict, should be 0.0
        }
        result = GrossMarginReconciler.process_record(record)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["receivable_billing"], 10000.5)
        self.assertEqual(result["payable"], 0.0)
        self.assertEqual(result["net_gross_margin"], 10000.5)

    def test_batch_pipeline_sync(self):
        # 4. Batch pipeline sync execution
        records = [
            {"id": f"id_{i}", "receivable_billing": 100 * i}
            for i in range(10)
        ]
        result = run_pipeline(records, async_mode=False)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["total"], 10)
        self.assertEqual(len(result["results"]), 10)
        self.assertEqual(result["processed"], 10)

    def test_batch_pipeline_async_progress(self):
        # 5. Batch pipeline async execution and progress snapshot
        records = [
            {"id": f"async_id_{i}", "receivable_billing": 200 * i, "equal_pay": 50 * i}
            for i in range(100) # High throughput simulation
        ]
        async_res = run_pipeline(records, async_mode=True)
        batch_id = async_res["batch_id"]
        pipeline = async_res["pipeline"]

        # Poll for completion
        completed = False
        for _ in range(50):
            snapshot = pipeline.get_progress_snapshot(batch_id)
            self.assertIsNotNone(snapshot)
            self.assertIn(snapshot["status"], ["processing", "completed"])
            if snapshot["status"] == "completed":
                completed = True
                break
            time.sleep(0.01)

        self.assertTrue(completed)
        snapshot = pipeline.get_progress_snapshot(batch_id)
        self.assertEqual(snapshot["total"], 100)
        self.assertEqual(snapshot["processed"], 100)

if __name__ == '__main__':
    unittest.main()
