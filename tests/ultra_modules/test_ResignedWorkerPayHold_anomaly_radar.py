import unittest
import math
from ultra_modules.ResignedWorkerPayHold_anomaly_radar import scan_resigned_worker_deductions, _clean_numeric, _get_percentile

class TestResignedWorkerPayHoldAnomalyRadar(unittest.TestCase):

    def test_clean_numeric_normal_and_dirty_data(self):
        # Normal inputs
        self.assertEqual(_clean_numeric(100.0), 100.0)
        self.assertEqual(_clean_numeric(100), 100.0)

        # String inputs
        self.assertEqual(_clean_numeric('100.0'), 100.0)
        self.assertEqual(_clean_numeric('  100  '), 100.0)
        self.assertEqual(_clean_numeric('1,000.5'), 1000.5)

        # Negative values healing
        self.assertEqual(_clean_numeric(-100.0), 100.0)
        self.assertEqual(_clean_numeric('-100'), 100.0)

        # Dirty data / defaults
        self.assertEqual(_clean_numeric(None), 0.0)
        self.assertEqual(_clean_numeric(None, default=10.0), 10.0)
        self.assertEqual(_clean_numeric(''), 0.0)
        self.assertEqual(_clean_numeric('abc'), 0.0)
        self.assertEqual(_clean_numeric([]), 0.0)
        self.assertEqual(_clean_numeric(math.nan), 0.0)
        self.assertEqual(_clean_numeric(math.inf), 0.0)

    def test_get_percentile(self):
        data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        self.assertEqual(_get_percentile(data, 0), 1)
        self.assertEqual(_get_percentile(data, 100), 10)
        self.assertEqual(_get_percentile(data, 50), 5.5)
        self.assertEqual(_get_percentile([], 50), 0.0)

    def test_scan_empty_input(self):
        self.assertEqual(scan_resigned_worker_deductions(None), [])
        self.assertEqual(scan_resigned_worker_deductions([]), [])

    def test_scan_fault_tolerance(self):
        # Passing invalid objects should self-heal and return defaults
        records = [
            None,
            "not a dict",
            {'worker_id': 'valid_1', 'pending_salary': 1000, 'deduction_amount': 100}
        ]
        results = scan_resigned_worker_deductions(records)
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0]['processed_pending_salary'], 0.0)
        self.assertEqual(results[1]['processed_pending_salary'], 0.0)
        self.assertEqual(results[2]['processed_pending_salary'], 1000.0)
        self.assertEqual(results[2]['status'], 'GREEN')

    def test_scan_normal_distribution_silent_pass(self):
        # 100 records with similar deduction ratios (10%)
        records = [{'worker_id': f'w_{i}', 'pending_salary': 1000, 'deduction_amount': 100} for i in range(100)]
        results = scan_resigned_worker_deductions(records)
        self.assertEqual(len(results), 100)
        for r in results:
            self.assertEqual(r['status'], 'GREEN')
            self.assertIn('静默放行', r['reason'])

    def test_scan_anomalies_top_3_percent(self):
        # 97 normal records (ratio 10%)
        records = [{'worker_id': f'w_{i}', 'pending_salary': 1000, 'deduction_amount': 100} for i in range(97)]
        # 1 YELLOW anomaly (ratio 30%)
        records.append({'worker_id': 'y_1', 'pending_salary': 1000, 'deduction_amount': 300})
        # 2 RED anomalies (ratio 150% and zero salary with deduction)
        records.append({'worker_id': 'r_1', 'pending_salary': 1000, 'deduction_amount': 1500})
        records.append({'worker_id': 'r_2', 'pending_salary': 0, 'deduction_amount': 500})

        results = scan_resigned_worker_deductions(records)
        self.assertEqual(len(results), 100)

        green_count = sum(1 for r in results if r['status'] == 'GREEN')
        yellow_count = sum(1 for r in results if r['status'] == 'YELLOW')
        red_count = sum(1 for r in results if r['status'] == 'RED')

        self.assertEqual(green_count, 97)
        self.assertEqual(yellow_count, 1)
        self.assertEqual(red_count, 2)

        y_1 = next(r for r in results if r['worker_id'] == 'y_1')
        self.assertEqual(y_1['status'], 'YELLOW')
        self.assertIn('处于全员前3%', y_1['reason'])

        r_1 = next(r for r in results if r['worker_id'] == 'r_1')
        self.assertEqual(r_1['status'], 'RED')
        self.assertIn('大于待发薪资', r_1['reason'])

        r_2 = next(r for r in results if r['worker_id'] == 'r_2')
        self.assertEqual(r_2['status'], 'RED')
        self.assertIn('待发薪资为0但急辞扣款达到', r_2['reason'])

    def test_scan_zero_salary_edge_case(self):
        # Very small dataset edge case where a zero salary with deduction exists
        records = [
            {'worker_id': 'w_1', 'pending_salary': 1000, 'deduction_amount': 100},
            {'worker_id': 'w_2', 'pending_salary': 1000, 'deduction_amount': 100},
            {'worker_id': 'w_3', 'pending_salary': 0, 'deduction_amount': 50}
        ]
        results = scan_resigned_worker_deductions(records)
        w_3 = next(r for r in results if r['worker_id'] == 'w_3')
        # In a tiny dataset it might hit the Top 3% logic, if not it will fallback to YELLOW warning for zero salary
        self.assertIn(w_3['status'], ['RED', 'YELLOW'])

if __name__ == '__main__':
    unittest.main()
