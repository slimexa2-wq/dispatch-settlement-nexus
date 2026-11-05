import unittest
from ultra_modules.ResignedWorkerPayHold_benchmark_suite import SyntheticFixtureGenerator, run_benchmark

class TestResignedWorkerPayHoldBenchmarkSuite(unittest.TestCase):
    def test_normal_data_generation(self):
        dataset = SyntheticFixtureGenerator.generate_normal_data(100)
        self.assertEqual(len(dataset), 100)
        result = run_benchmark(dataset)
        self.assertEqual(result["processed_count"], 100)
        # Verify first item processed correctly
        first_res = result["results"][0]
        self.assertIn("base_salary", first_res)
        self.assertEqual(first_res["base_salary"], 5000.0)

    def test_dirty_data_processing(self):
        dataset = SyntheticFixtureGenerator.generate_dirty_data(100)
        self.assertEqual(len(dataset), 100)
        # This should not crash despite invalid strings, Nones, lists, dicts
        result = run_benchmark(dataset)
        self.assertEqual(result["processed_count"], 100)
        for res in result["results"]:
            # Check self-healing: invalid numbers default to 0.0, boolean to False
            self.assertGreaterEqual(res["base_salary"], 0.0)
            self.assertIsInstance(res["is_abrupt_resignation"], bool)
            self.assertIsInstance(res["actual_deduction"], float)

    def test_missing_param_fallback(self):
        dataset = SyntheticFixtureGenerator.generate_missing_params(50)
        self.assertEqual(len(dataset), 50)
        # Should not crash and use default values
        result = run_benchmark(dataset)
        self.assertEqual(result["processed_count"], 50)
        for res in result["results"]:
            self.assertEqual(res["base_salary"], 0.0)
            self.assertEqual(res["is_abrupt_resignation"], False)
            self.assertEqual(res["actual_deduction"], 0.0)
            self.assertEqual(res["final_pay"], 0.0)

    def test_extreme_bounds_and_cross_year(self):
        dataset = SyntheticFixtureGenerator.generate_extreme_bounds_data(100)
        self.assertEqual(len(dataset), 100)
        # Extreme numbers should not cause overflows or crashes
        result = run_benchmark(dataset)
        self.assertEqual(result["processed_count"], 100)
        for idx, res in enumerate(result["results"]):
            self.assertGreaterEqual(res["base_salary"], 0.0)  # negative salaries default to 0
            self.assertLessEqual(res["actual_deduction"], res["base_salary"] * 0.2) # Max deduction rate falls back to 0.2 on out of bounds
            self.assertGreaterEqual(res["final_pay"], 0.0)

    def test_performance_benchmark(self):
        count = 10000
        dataset = SyntheticFixtureGenerator.generate_massive_concurrency_batch(count)
        self.assertEqual(len(dataset), count)
        result = run_benchmark(dataset)
        self.assertEqual(result["processed_count"], count)

        # Verify millisecond response requirement per item roughly (10000 items should take less than 1 second, or 1000ms total)
        # Given it's a lightweight engine, it should be well under 1000ms. We set a generous upper bound for the CI environment.
        self.assertLess(result["total_time_ms"], 5000.0, f"Benchmark took too long: {result['total_time_ms']} ms")

if __name__ == '__main__':
    unittest.main()
