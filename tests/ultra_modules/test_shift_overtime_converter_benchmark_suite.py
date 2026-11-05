import unittest
from ultra_modules.shift_overtime_converter_benchmark_suite import (
    convert_shift_overtime,
    generate_synthetic_fixtures,
    run_benchmark
)

class BadDict(dict):
    """Mock dictionary that raises exceptions on access to ensure 100% coverage of bare Excepts."""
    def get(self, key, default=None):
        raise Exception("Simulated fatal exception during dict access")

class TestShiftOvertimeConverterBenchmarkSuite(unittest.TestCase):

    def test_normal_operation(self):
        """Test normal shift overtime calculation for day/night, regular/weekend/holiday."""
        # Normal day 10 hours -> 8 regular, 2 OT 1.5x
        res1 = convert_shift_overtime({
            'worker_id': 'W001',
            'shift_type': 'day',
            'hours_worked': 10.0,
            'is_weekend': False,
            'is_holiday': False
        })
        self.assertEqual(res1['regular_hours'], 8.0)
        self.assertEqual(res1['overtime_1_5x'], 2.0)
        self.assertEqual(res1['overtime_2x'], 0.0)
        self.assertEqual(res1['overtime_3x'], 0.0)

        # Weekend 10 hours -> 0 regular, 10 OT 2x
        res2 = convert_shift_overtime({
            'worker_id': 'W002',
            'shift_type': 'night',
            'hours_worked': 10.0,
            'is_weekend': True,
            'is_holiday': False
        })
        self.assertEqual(res2['regular_hours'], 0.0)
        self.assertEqual(res2['overtime_1_5x'], 0.0)
        self.assertEqual(res2['overtime_2x'], 10.0)
        self.assertEqual(res2['overtime_3x'], 0.0)

        # Holiday 10 hours -> 0 regular, 10 OT 3x
        res3 = convert_shift_overtime({
            'worker_id': 'W003',
            'shift_type': 'day',
            'hours_worked': 10.0,
            'is_weekend': False, # holiday overrides weekend conceptually but let's test holiday flag
            'is_holiday': True
        })
        self.assertEqual(res3['regular_hours'], 0.0)
        self.assertEqual(res3['overtime_1_5x'], 0.0)
        self.assertEqual(res3['overtime_2x'], 0.0)
        self.assertEqual(res3['overtime_3x'], 10.0)

    def test_missing_parameters_fallback(self):
        """Test that missing parameters gracefully fallback to safe defaults (8h day shift, normal)."""
        res = convert_shift_overtime({})
        self.assertEqual(res['worker_id'], 'UNKNOWN')
        self.assertEqual(res['shift_type'], 'day')
        self.assertEqual(res['regular_hours'], 8.0)
        self.assertEqual(res['overtime_1_5x'], 0.0)
        self.assertEqual(res['overtime_2x'], 0.0)
        self.assertEqual(res['overtime_3x'], 0.0)

    def test_dirty_data_self_healing(self):
        """Test that garbage data, wrong types, and garbled text do not crash the system."""
        res = convert_shift_overtime({
            'worker_id': 123,
            'shift_type': '乱码_!@#$',
            'hours_worked': 'not_a_number',
            'is_weekend': None,
            'is_holiday': 'yes' # string where bool/int expected
        })
        self.assertEqual(res['shift_type'], 'day')
        self.assertEqual(res['regular_hours'], 8.0)
        self.assertEqual(res['overtime_1_5x'], 0.0)
        self.assertEqual(res['overtime_2x'], 0.0)
        self.assertEqual(res['overtime_3x'], 0.0)

        # Test negative hours clamp
        res_neg = convert_shift_overtime({'hours_worked': -5.0})
        self.assertEqual(res_neg['regular_hours'], 0.0)

        # Test excessive hours clamp
        res_excess = convert_shift_overtime({'hours_worked': 30.0})
        self.assertEqual(res_excess['regular_hours'], 8.0)
        self.assertEqual(res_excess['overtime_1_5x'], 16.0) # clamped to 24.0, so 24 - 8 = 16

    def test_extreme_exception_fallback(self):
        """Test that the system can survive even absolute dictionary access failure (100% coverage)."""
        bad_data = BadDict()
        res = convert_shift_overtime(bad_data)
        self.assertEqual(res['shift_type'], 'day')
        self.assertEqual(res['regular_hours'], 8.0)

        # Test the topmost exception for non-dict
        res_non_dict = convert_shift_overtime(None)
        self.assertEqual(res_non_dict['shift_type'], 'day')
        self.assertEqual(res_non_dict['regular_hours'], 8.0)

    def test_benchmark_concurrency(self):
        """Test high-concurrency performance and zero-crash capability."""
        elapsed_ms, total, success = run_benchmark(concurrency=1000)
        self.assertEqual(total, 1000)
        self.assertEqual(success, 1000)
        # Should be blazing fast, easily under 1000ms for 1000 items in Python
        self.assertTrue(elapsed_ms < 1000.0, f"Benchmark took too long: {elapsed_ms}ms")

        # Test synthetic generation sizes directly
        fixtures = generate_synthetic_fixtures(10)
        self.assertEqual(len(fixtures), 10)

if __name__ == '__main__':
    unittest.main()
