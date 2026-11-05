import time
import unittest
from ultra_modules.fuzzy_header_fingerprint_batch_pipeline import FuzzyHeaderFingerprintBatchPipeline

class TestFuzzyHeaderFingerprintBatchPipeline(unittest.TestCase):
    def setUp(self):
        self.pipeline = FuzzyHeaderFingerprintBatchPipeline(threshold=0.2)

    def test_normal_scenario_valid_headers(self):
        """Test case 1: Normal scenario with valid recognizable headers."""
        headers = ["员工号", "出勤天数", "基本薪资", "实发合计"]
        results = self.pipeline.process_batch(headers)

        self.assertEqual(len(results), 4)

        categories = [r["category"] for r in results]
        self.assertIn("emp_id", categories)
        self.assertIn("attendance_days", categories)
        self.assertIn("basic_salary", categories)
        self.assertIn("net_salary", categories)

        for r in results:
            self.assertGreaterEqual(r["confidence"], 0.2)

    def test_dirty_data_auto_healing(self):
        """Test case 2: Dirty data auto-healing (special characters, nulls, random objects)."""
        class DummyObj:
            def __str__(self):
                return "xxxxxyyyyyzzzzz!!!!"

        dirty_headers = [
            "  *员工**姓名!!  ",
            None,
            "",
            DummyObj(),
            "---123__",
            "应 发(元)"
        ]
        results = self.pipeline.process_batch(dirty_headers)

        self.assertEqual(len(results), 6)

        # Test clean functionality and categorization
        self.assertEqual(results[0]["category"], "emp_name")
        self.assertEqual(results[0]["cleaned"], "员工姓名")

        # Null and empty should fallback to unknown
        self.assertEqual(results[1]["category"], "unknown")
        self.assertEqual(results[2]["category"], "unknown")

        # DummyObj converts to string and processes, likely unknown
        self.assertEqual(results[3]["cleaned"], "xxxxxyyyyyzzzzz")
        self.assertEqual(results[3]["category"], "unknown")

        self.assertEqual(results[4]["cleaned"], "123__")
        self.assertEqual(results[4]["category"], "unknown")

        self.assertEqual(results[5]["category"], "gross_salary")
        self.assertEqual(results[5]["cleaned"], "应发元")

    def test_missing_parameter_default_fallback(self):
        """Test case 3: Missing parameter/default fallback (empty batch, missing arguments)."""
        # Test default parameter None
        results_none = self.pipeline.process_batch(None)
        self.assertEqual(len(results_none), 0)
        progress_none = self.pipeline.get_progress()
        self.assertEqual(progress_none["status"], "COMPLETED")
        self.assertEqual(progress_none["percentage"], 100.0)

        # Test missing arguments entirely (pipeline uses empty list fallback)
        results_empty = self.pipeline.process_batch()
        self.assertEqual(len(results_empty), 0)

        # Test single item instead of list
        results_single = self.pipeline.process_batch("姓名")
        self.assertEqual(len(results_single), 1)
        self.assertEqual(results_single[0]["category"], "emp_name")

    def test_extreme_boundary_cases(self):
        """Test case 4: Extreme boundary cases (extremely long strings, huge batch sizes)."""
        huge_batch = ["员工号"] * 1000

        start_time = time.time()
        results = self.pipeline.process_batch(huge_batch)
        end_time = time.time()

        self.assertEqual(len(results), 1000)
        self.assertEqual(results[0]["category"], "emp_id")
        self.assertEqual(results[999]["category"], "emp_id")

        # Should complete relatively quickly
        self.assertLess(end_time - start_time, 5.0)

        long_string = "非常长的毫无意义的字符串" * 100 + "实发工资" + "更多无意义字符" * 100
        result_long = self.pipeline.process_batch([long_string])
        self.assertEqual(len(result_long), 1)
        self.assertEqual(result_long[0]["cleaned"][:10], "非常长的毫无意义的字")

    def test_concurrency_and_async_processing(self):
        """Test case 5: Concurrency and asynchronous processing."""
        headers = ["员工号", "姓名", "应发", "实发", "打卡天数"] * 200 # 1000 items

        self.pipeline.process_batch_async(headers)

        progress = self.pipeline.get_progress()
        self.assertEqual(progress["total"], 1000)
        self.assertIn(progress["status"], ["RUNNING", "COMPLETED"])

        # Wait for completion
        completed = self.pipeline.wait_completion(timeout=10.0)
        self.assertTrue(completed)

        progress = self.pipeline.get_progress()
        self.assertEqual(progress["status"], "COMPLETED")
        self.assertEqual(progress["progress"], 1000)
        self.assertEqual(progress["percentage"], 100.0)

        results = self.pipeline.get_results()
        self.assertEqual(len(results), 1000)
        self.assertEqual(results[0]["category"], "emp_id")

if __name__ == '__main__':
    unittest.main()
