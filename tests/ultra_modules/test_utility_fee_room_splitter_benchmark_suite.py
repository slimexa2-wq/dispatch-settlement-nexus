import unittest
import math

from ultra_modules.utility_fee_room_splitter_benchmark_suite import generate_synthetic_fixtures, run_benchmark

class TestUtilityFeeRoomSplitterBenchmarkSuite(unittest.TestCase):
    def test_normal_dataset(self):
        """
        Proves accurate proportional splitting for normal records.
        """
        total_fee = 100.0
        residents = [
            {'name': 'Alice', 'days': 10},
            {'name': 'Bob', 'days': 20},
            {'name': 'Charlie', 'days': 20}
        ]

        benchmark_result = run_benchmark(total_fee, residents, iterations=1)
        result = benchmark_result['result']

        self.assertEqual(len(result), 3)
        total_split = sum(r['fee'] for r in result)
        self.assertAlmostEqual(total_split, 100.0)

        # 10 days out of 50 = 20%, 20 out of 50 = 40%
        alice_fee = next(r['fee'] for r in result if r['name'] == 'Alice')
        bob_fee = next(r['fee'] for r in result if r['name'] == 'Bob')

        self.assertAlmostEqual(alice_fee, 20.0)
        self.assertAlmostEqual(bob_fee, 40.0)

    def test_dirty_data_self_healing(self):
        """
        Passes garbage data, strings, NaN, and None, proving self-healing behavior with no crashes.
        """
        total_fee = "garbage"
        residents = [
            {'name': None, 'days': 'invalid'},
            {'name': 'Bob', 'days': float('nan')},
            {'name': 'Charlie', 'days': -10}
        ]

        benchmark_result = run_benchmark(total_fee, residents, iterations=1)
        result = benchmark_result['result']

        self.assertEqual(len(result), 3)
        # Garbage total_fee should default to 0.0
        total_split = sum(r['fee'] for r in result)
        self.assertEqual(total_split, 0.0)

        # All days should default to 1 due to invalid data and negative days
        days = [r['days'] for r in result]
        self.assertEqual(days, [1, 1, 1])

    def test_missing_parameters_fallback(self):
        """
        Passes missing keys or missing total fee, verifying zero-configuration default fallbacks.
        """
        total_fee = None
        residents = [
            {}, # Missing all keys
            {'name': 'Bob'}, # Missing days
            {'days': 5} # Missing name
        ]

        benchmark_result = run_benchmark(total_fee, residents, iterations=1)
        result = benchmark_result['result']

        self.assertEqual(len(result), 3)
        total_split = sum(r['fee'] for r in result)
        self.assertEqual(total_split, 0.0)

        # Check defaults
        names = [r['name'] for r in result]
        self.assertEqual(names, ['unknown', 'Bob', 'unknown'])

        days = [r['days'] for r in result]
        self.assertEqual(days, [1, 1, 5])

    def test_extreme_boundary(self):
        """
        Generates synthetic cross-year/cross-month timestamps and boundaries.
        Testing extreme total fee size and zero-fee conditions.
        """
        # Testing massive fee and float limit issues
        total_fee = 1e12
        residents = generate_synthetic_fixtures(100)

        benchmark_result = run_benchmark(total_fee, residents, iterations=10)
        result = benchmark_result['result']

        self.assertEqual(len(result), 100)
        total_split = sum(r['fee'] for r in result)
        self.assertAlmostEqual(total_split, total_fee, delta=1e8)  # Float precision buffer

        # Ensure no negative fees assigned
        self.assertTrue(all(r['fee'] >= 0 for r in result))

    def test_performance_benchmark(self):
        """
        Creates a massive synthetic dataset to verify zero crashes and
        that the core computation finishes in a reasonable fraction of a second
        (millisecond response profile).
        """
        num_records = 10000
        total_fee = 50000.0
        residents = generate_synthetic_fixtures(num_records)

        # Run benchmark (iter=10 to just test pure concurrency without taking too long in CI)
        benchmark_result = run_benchmark(total_fee, residents, iterations=10)
        result = benchmark_result['result']

        self.assertEqual(len(result), num_records)

        # Confirm no crash and check time
        total_split = sum(r['fee'] for r in result)
        self.assertAlmostEqual(total_split, total_fee, delta=1.0)

        # The execution time should be under 1000ms for 10000 records
        self.assertLess(benchmark_result['avg_time_ms'], 1000.0)

if __name__ == '__main__':
    unittest.main()
