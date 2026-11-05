import unittest
import time
from datetime import datetime, timedelta
import random

from ultra_modules.CrossMonthDuplicateGuard_benchmark_suite import CrossMonthDuplicateGuard, verify_application

class TestCrossMonthDuplicateGuard(unittest.TestCase):

    def test_normal_execution(self):
        """Test 1: Normal execution with clean data."""
        history = [
            {'worker_id': 'W001', 'project_id': 'P001', 'apply_date': '2023-05-15'},
            {'worker_id': 'W002', 'project_id': 'P002', 'apply_date': '2023-05-10'}
        ]

        # Duplicate case
        app1 = {'worker_id': 'W001', 'project_id': 'P001', 'apply_date': '2023-06-15'}
        res1 = verify_application(app1, history)
        self.assertTrue(res1['success'])
        self.assertTrue(res1['is_duplicate'])

        # Valid case (different project)
        app2 = {'worker_id': 'W001', 'project_id': 'P002', 'apply_date': '2023-06-15'}
        res2 = verify_application(app2, history)
        self.assertFalse(res2['is_duplicate'])

        # Valid case (outside 3 months limit)
        app3 = {'worker_id': 'W001', 'project_id': 'P001', 'apply_date': '2023-10-01'}
        res3 = verify_application(app3, history)
        self.assertFalse(res3['is_duplicate'])

    def test_dirty_data_self_healing(self):
        """Test 2: Dirty data self-healing (NaNs, Nones, unprintable characters, malformed types)."""
        history = [
            {'worker_id': 'W003', 'project_id': 'P003', 'apply_date': '2023-05-15'},
            None,
            "Not a dict",
            {'worker_id': None, 'project_id': 'P003', 'apply_date': '2023-05-15'},
            {'worker_id': 'W004', 'project_id': 'P004', 'apply_date': 'INVALID_DATE'}
        ]

        # Guard should silently clean data
        guard = CrossMonthDuplicateGuard(history)
        self.assertEqual(len(guard.history_data), 1)

        # Application with dirty data
        dirty_app = {
            'worker_id': 'W003\x00\x01\x02', # Unprintable chars
            'project_id': 'P003???',        # Garbled characters
            'apply_date': '2023-05-20'
        }

        res = verify_application(dirty_app, history)
        self.assertTrue(res['success'])
        self.assertTrue(res['is_duplicate']) # Cleaned to W003 and P003, which is duplicate

    def test_missing_parameter_default_fallbacks(self):
        """Test 3: Missing parameter default fallbacks."""
        history = [{'worker_id': 'UNKNOWN', 'project_id': 'UNKNOWN', 'apply_date': datetime.now().strftime('%Y-%m-%d')}]

        # Completely empty app
        res = verify_application(None, history)
        self.assertTrue(res['success'])
        # Fallbacks applied: worker_id='UNKNOWN', project_id='UNKNOWN', apply_date=now
        self.assertTrue(res['is_duplicate'])

        # Partial missing
        res2 = verify_application({'worker_id': 'W005'}, [])
        self.assertTrue(res2['success'])
        self.assertFalse(res2['is_duplicate'])

    def test_extreme_boundary_conditions(self):
        """Test 4: Extreme boundary conditions (cross-year, cross-month date calculation)."""
        history = [
            {'worker_id': 'W006', 'project_id': 'P006', 'apply_date': '2022-11-15'},
            {'worker_id': 'W007', 'project_id': 'P007', 'apply_date': '2024-02-28'}, # Leap year scenario
        ]

        # Cross year within 3 months
        app1 = {'worker_id': 'W006', 'project_id': 'P006', 'apply_date': '2023-01-10'}
        res1 = verify_application(app1, history)
        self.assertTrue(res1['is_duplicate'])

        # Cross year outside 3 months
        app2 = {'worker_id': 'W006', 'project_id': 'P006', 'apply_date': '2023-03-01'}
        res2 = verify_application(app2, history)
        self.assertFalse(res2['is_duplicate'])

        # Leap year handling within 3 months
        app3 = {'worker_id': 'W007', 'project_id': 'P007', 'apply_date': '2024-03-05'}
        res3 = verify_application(app3, history)
        self.assertTrue(res3['is_duplicate'])

    def test_synthetic_dataset_benchmark(self):
        """Test 5: Synthetic dataset for benchmark validation (large history to ensure millisecond response)."""
        # Generate 100,000 synthetic records
        large_history = []
        base_date = datetime(2023, 1, 1)
        for i in range(100000):
            # Roughly distribute dates over a year
            r_date = base_date + timedelta(days=random.randint(0, 365))
            large_history.append({
                'worker_id': f'W{random.randint(1, 10000)}',
                'project_id': f'P{random.randint(1, 100)}',
                'apply_date': r_date.strftime('%Y-%m-%d')
            })

        # Add a guaranteed duplicate near the end
        large_history.append({
            'worker_id': 'W99999',
            'project_id': 'P999',
            'apply_date': '2023-05-15'
        })

        app = {'worker_id': 'W99999', 'project_id': 'P999', 'apply_date': '2023-06-15'}

        # Test performance of full verify_application wrapper
        # History initialization + execution
        start_time = time.perf_counter()
        res = verify_application(app, large_history)
        end_time = time.perf_counter()

        total_ms = (end_time - start_time) * 1000

        self.assertTrue(res['success'])
        self.assertTrue(res['is_duplicate'])

        # Ensure guard check logic itself is in milliseconds
        # (initialization might take slightly longer for 100k, but checking must be fast)
        guard = CrossMonthDuplicateGuard(large_history)

        # Verify check_duplicate performance directly
        clean_app = {
            'worker_id': 'W99999',
            'project_id': 'P999',
            'apply_date': '2023-06-15'
        }

        check_start = time.perf_counter()
        is_dup = guard.check_duplicate(clean_app)
        check_end = time.perf_counter()

        check_ms = (check_end - check_start) * 1000

        self.assertTrue(is_dup)
        # Check time should easily be under 50ms for 100k records (O(N) search in Python)
        self.assertLess(check_ms, 50.0, f"Check took {check_ms:.2f}ms, which is too slow!")

if __name__ == '__main__':
    unittest.main()
