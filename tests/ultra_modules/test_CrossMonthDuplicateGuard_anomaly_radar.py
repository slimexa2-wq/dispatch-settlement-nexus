import unittest
from ultra_modules.CrossMonthDuplicateGuard_anomaly_radar import scan_anomalies

class TestCrossMonthDuplicateGuardAnomalyRadar(unittest.TestCase):

    def test_normal_data(self):
        # 100 records: 97 with low amounts, 3 with high amounts (Top 3%)
        records = [{'id': i, 'worker_id': f'w_{i}', 'project_id': 'p_1', 'amount': 100.0} for i in range(97)]
        records.extend([{'id': i, 'worker_id': f'w_{i}', 'project_id': 'p_1', 'amount': 10000.0} for i in range(97, 100)])

        result = scan_anomalies(records)
        self.assertEqual(len(result), 100)

        green_count = sum(1 for r in result if r['status_color'] == 'GREEN')
        red_count = sum(1 for r in result if r['status_color'] == 'RED')
        yellow_count = sum(1 for r in result if r['status_color'] == 'YELLOW')

        self.assertEqual(green_count, 97)
        # Top 3 will be marked RED because z-score > 2 or IQR outlier
        self.assertEqual(red_count, 3)
        self.assertEqual(yellow_count, 0)

    def test_dirty_data_self_healing(self):
        # Missing amounts, missing keys, invalid types, etc.
        records = [
            {'worker_id': 'w_1', 'project_id': 'p_1', 'amount': 'bad'},
            {'worker_id': 'w_2', 'project_id': 'p_1'},  # No amount
            'im_a_string_not_a_dict',
            None,  # Not a dict
            {'amount': 150.0}  # No worker/project
        ]

        result = scan_anomalies(records)
        self.assertEqual(len(result), 5)
        # Should gracefully self-heal without crashing
        self.assertEqual(result[0]['amount'], 0.0)
        self.assertEqual(result[1]['amount'], 0.0)
        self.assertEqual(result[2]['amount'], 0.0)
        self.assertEqual(result[3]['amount'], 0.0)
        self.assertEqual(result[4]['amount'], 150.0)

        self.assertTrue(result[4]['worker_id'].startswith('auto_worker_'))
        self.assertTrue(result[4]['project_id'].startswith('auto_project_'))

        # All GREEN since N=5, top 3% is 1, but Z-scores are low (or identical).
        # Actually Top 1 will be YELLOW since it doesn't trigger outlier rules.

    def test_missing_param_fallback(self):
        # Zero configuration handling
        self.assertEqual(scan_anomalies(), [])
        self.assertEqual(scan_anomalies([]), [])

        # Passing a single dict instead of a list
        res = scan_anomalies({'amount': 200.0})
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]['amount'], 200.0)

    def test_extreme_boundary(self):
        # 2 records with massive outlier vs 100 normal
        records = [{'worker_id': f'w_{i}', 'project_id': 'p_1', 'amount': 1.0} for i in range(100)]
        records.append({'worker_id': 'w_bad', 'project_id': 'p_1', 'amount': 999999999.0})

        result = scan_anomalies(records)
        bad = next(r for r in result if r['worker_id'] == 'w_bad')
        self.assertEqual(bad['status_color'], 'RED')
        self.assertTrue('偏离分布' in bad['anomaly_reason'])

    def test_yellow_marker(self):
        # Top 3% but not a massive outlier (e.g. z < 2, not IQR outlier)
        # Using a uniform distribution so Z-score is low and within IQR
        records = [{'worker_id': f'w_{i}', 'project_id': 'p_1', 'amount': float(i)} for i in range(100)]

        result = scan_anomalies(records)

        yellows = [r for r in result if r['status_color'] == 'YELLOW']
        self.assertEqual(len(yellows), 3)
        for y in yellows:
            self.assertTrue(y['amount'] in [97.0, 98.0, 99.0])
            self.assertTrue('高位' in y['anomaly_reason'])

    def test_zero_variance(self):
        # All same amount -> stdev = 0
        records = [{'worker_id': f'w_{i}', 'project_id': 'p_1', 'amount': 50.0} for i in range(100)]
        result = scan_anomalies(records)
        self.assertEqual(len(result), 100)
        # First 3 will be YELLOW as they are top 3% (by index, tied score)
        yellows = [r for r in result if r['status_color'] == 'YELLOW']
        greens = [r for r in result if r['status_color'] == 'GREEN']
        self.assertEqual(len(yellows), 3)
        self.assertEqual(len(greens), 97)

    def test_duplicate_claims(self):
        # Same worker and project claimed multiple times
        records = [{'worker_id': f'w_{i}', 'project_id': 'p_1', 'amount': 50.0} for i in range(98)]
        records.append({'worker_id': 'w_dup', 'project_id': 'p_1', 'amount': 50.0})
        records.append({'worker_id': 'w_dup', 'project_id': 'p_1', 'amount': 50.0})

        result = scan_anomalies(records)
        dups = [r for r in result if r['worker_id'] == 'w_dup']
        self.assertEqual(len(dups), 2)
        for d in dups:
            self.assertEqual(d['status_color'], 'RED')
            self.assertTrue('重复' in d['anomaly_reason'])

if __name__ == '__main__':
    unittest.main()
