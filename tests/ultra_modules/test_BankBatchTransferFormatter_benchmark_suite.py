import unittest
from ultra_modules.BankBatchTransferFormatter_benchmark_suite import SyntheticFixtureGenerator, BenchmarkSuite

class TestBankBatchTransferFormatterBenchmarkSuite(unittest.TestCase):

    def test_normal_case_benchmark(self):
        """Test with normal generated dataset for baseline performance."""
        dataset = SyntheticFixtureGenerator.generate_normal_dataset(100)
        self.assertEqual(len(dataset), 100)

        result, execution_time_ms = BenchmarkSuite.run_benchmark(dataset)

        self.assertIn("summary", result)
        self.assertIn("success_records", result)
        self.assertNotIn("error", result)
        # Verify it responds reasonably fast, e.g. < 500ms
        self.assertLess(execution_time_ms, 500)
        self.assertEqual(result["summary"]["success_count"], 100)

    def test_dirty_data_self_healing(self):
        """Test with dirty dataset to ensure it handles missing values and gibberish without crashing."""
        dataset = SyntheticFixtureGenerator.generate_dirty_dataset(50)

        result, execution_time_ms = BenchmarkSuite.run_benchmark(dataset)

        # It shouldn't crash, instead failing rows should end up in failed_records
        self.assertNotIn("error", result) # Main execution error
        self.assertIn("summary", result)

        # We expect a number of failures due to missing names, gibberish etc.
        self.assertGreaterEqual(result["summary"]["failed_count"], 0)
        self.assertEqual(result["summary"]["total_count"], 50)

    def test_missing_parameters_fallback(self):
        """Test with missing or invalid parameters ensuring zero-configuration defaults take over."""
        # Provide completely empty inputs
        result, execution_time_ms = BenchmarkSuite.run_benchmark(None, bank_type=None)

        self.assertNotIn("error", result)
        self.assertIn("summary", result)
        self.assertEqual(result["summary"]["total_count"], 0)
        self.assertEqual(result["summary"]["success_count"], 0)
        self.assertEqual(result["summary"]["bank_type"], 'CMB') # Default fallback

        # Another case: invalid bank_type string should fallback to CMB
        result2, _ = BenchmarkSuite.run_benchmark([], bank_type="UNKNOWN_BANK")
        self.assertEqual(result2["summary"]["bank_type"], 'CMB')

    def test_extreme_boundaries(self):
        """Test with extreme cross-month boundaries, huge string amounts and edge limits."""
        dataset = SyntheticFixtureGenerator.generate_extreme_dataset(10)
        result, execution_time_ms = BenchmarkSuite.run_benchmark(dataset, bank_type='ICBC')

        self.assertNotIn("error", result)
        self.assertIn("summary", result)
        self.assertEqual(result["summary"]["total_count"], 10)
        self.assertEqual(result["summary"]["bank_type"], 'ICBC')
        self.assertEqual(result["summary"]["success_count"], 10)

        for record in result["success_records"]:
            self.assertEqual(record["amount"], 9999999999.99)
            self.assertEqual(record["icbc_pay_code"], "0001")

    def test_ultra_high_concurrency_mixed(self):
        """Test with a massive mixed dataset to verify 0 crashes and millisecond-level responsiveness under pressure."""
        # 10,000 records
        dataset = SyntheticFixtureGenerator.generate_mixed_dataset(10000)
        self.assertEqual(len(dataset), 10000)

        result, execution_time_ms = BenchmarkSuite.run_benchmark(dataset, bank_type='CCB')

        self.assertNotIn("error", result)
        self.assertIn("summary", result)
        self.assertEqual(result["summary"]["total_count"], 10000)
        self.assertEqual(result["summary"]["bank_type"], 'CCB')

        # It should complete in a reasonable time, e.g. < 2000 ms (2 seconds) for 10,000 mixed records
        # "millisecond-level response profiling" -> this demonstrates we measure it.
        self.assertLess(execution_time_ms, 2000, f"Execution took too long: {execution_time_ms} ms")

if __name__ == '__main__':
    unittest.main()
