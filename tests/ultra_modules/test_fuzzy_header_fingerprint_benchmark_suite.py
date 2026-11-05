import unittest
from ultra_modules.fuzzy_header_fingerprint_benchmark_suite import FuzzyHeaderFingerprintBenchmarkSuite

class TestFuzzyHeaderFingerprintBenchmarkSuite(unittest.TestCase):

    def test_normal_execution(self):
        """Test 1: Normal execution with a valid standard dataset."""
        dataset = ["实发工资", "应发工资", "打卡天数", "员工工号"]
        results = FuzzyHeaderFingerprintBenchmarkSuite.run_benchmark(dataset=dataset, concurrency=4)

        self.assertEqual(results["total_records"], 4)
        self.assertEqual(results["success_count"], 4)
        self.assertTrue(results["zero_crash"])
        # Should be very fast for 4 records
        self.assertTrue(results["total_time_ms"] < 1000)

    def test_dirty_data_self_healing(self):
        """Test 2: Dirty data self-healing."""
        dataset = [
            None,
            123.45,
            True,
            ["not", "a", "string"],
            {"key": "value"},
            "\n\t  实发工资!!!",
            "应发工资 (copy)",
            "???打卡天数_v2",
        ]

        results = FuzzyHeaderFingerprintBenchmarkSuite.run_benchmark(dataset=dataset, concurrency=10)

        self.assertEqual(results["total_records"], len(dataset))
        self.assertEqual(results["success_count"], len(dataset))
        self.assertTrue(results["zero_crash"])

    def test_missing_parameter_fallback(self):
        """Test 3: Missing parameter fallback (zero-configuration)."""
        # Call without passing a dataset; it should generate synthetic data by default
        results = FuzzyHeaderFingerprintBenchmarkSuite.run_benchmark(concurrency=50)

        self.assertEqual(results["total_records"], 1000)
        self.assertEqual(results["success_count"], 1000)
        self.assertTrue(results["zero_crash"])

    def test_extreme_boundary_cases(self):
        """Test 4: Extreme boundary cases (cross-year/month)."""
        dataset = [
            "2023-12-31_实发工资",
            "2024-01-01_应发工资",
            "NULL_员工工号",
            "2024-12-31_打卡天数 \r\n",
            "!!!2025-01-01_部门"
        ]

        results = FuzzyHeaderFingerprintBenchmarkSuite.run_benchmark(dataset=dataset, concurrency=10)

        self.assertEqual(results["total_records"], len(dataset))
        self.assertEqual(results["success_count"], len(dataset))
        self.assertTrue(results["zero_crash"])

    def test_large_dataset_performance(self):
        """Test 5: Validation of zero-crash and millisecond-level response on a large dataset."""
        dataset = FuzzyHeaderFingerprintBenchmarkSuite.generate_synthetic_fixtures(5000)

        results = FuzzyHeaderFingerprintBenchmarkSuite.run_benchmark(dataset=dataset, concurrency=100)

        self.assertEqual(results["total_records"], 5000)
        self.assertEqual(results["success_count"], 5000)
        self.assertTrue(results["zero_crash"])
        # Ensure average response is millisecond-level (e.g. < 50ms)
        self.assertTrue(results["avg_time_ms"] < 50)

if __name__ == "__main__":
    unittest.main()
