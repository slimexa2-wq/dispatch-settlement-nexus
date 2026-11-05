import unittest
import decimal
from ultra_modules.four_way_commission_auditor_anomaly_radar import audit_vendor_commissions

class TestFourWayCommissionAuditorAnomalyRadar(unittest.TestCase):

    def test_normal_cases(self):
        # A large dataset (e.g., 100 records) where only the top 3% get flagged, and 97% are Green.
        records = []
        for i in range(100):
            records.append({
                'id': f'emp_{i}',
                'salary': 5000 + i,
                'attendance': 20 + (i % 5),
                'policy_compliance': 100,
                'last_month_commission': 500
            })

        # Add 3 extreme anomalies that should be flagged (Top 3%)
        records[10] = {
            'id': 'emp_10',
            'salary': 500000, # Extremely large
            'attendance': 20,
            'policy_compliance': 100,
            'last_month_commission': 500
        }
        records[50] = {
            'id': 'emp_50',
            'salary': 5000,
            'attendance': 20,
            'policy_compliance': 100000, # Extremely large
            'last_month_commission': 500
        }
        records[90] = {
            'id': 'emp_90',
            'salary': 5000,
            'attendance': 20,
            'policy_compliance': 100,
            'last_month_commission': 500000 # Extremely large
        }

        results = audit_vendor_commissions(records)

        self.assertEqual(len(results), 100)

        # Check Top 3 (since n=100, 3% is 3)
        anomalies = [r for r in results if r['status'] != 'Green']
        self.assertEqual(len(anomalies), 3)

        # Verify the anomalies are the 3 we expected
        anomaly_ids = [r['id'] for r in anomalies]
        self.assertIn('emp_10', anomaly_ids)
        self.assertIn('emp_50', anomaly_ids)
        self.assertIn('emp_90', anomaly_ids)

        # Verify status of anomalies
        for r in anomalies:
            self.assertEqual(r['status'], 'Yellow')
            self.assertTrue("数值偏离度过高" in r['reason'])

    def test_dirty_data_self_healing(self):
        # Records with strings, Nones, and malformed types that fallback to 0.00 cleanly.
        records = [
            {
                'id': 'dirty_1',
                'salary': None,
                'attendance': 'invalid',
                'policy_compliance': [],
                'last_month_commission': {}
            }
        ]

        results = audit_vendor_commissions(records)
        self.assertEqual(len(results), 1)
        r = results[0]

        zero_dec = decimal.Decimal('0.00')
        self.assertEqual(r['salary'], zero_dec)
        self.assertEqual(r['attendance'], zero_dec)
        self.assertEqual(r['policy_compliance'], zero_dec)
        self.assertEqual(r['last_month_commission'], zero_dec)

    def test_missing_params(self):
        # Calling the function with no arguments returns a safe default.
        self.assertEqual(audit_vendor_commissions(), [])
        self.assertEqual(audit_vendor_commissions(None), [])
        self.assertEqual(audit_vendor_commissions("not a list"), [])

    def test_extreme_edge_cases(self):
        # Very large/negative numbers that trigger anomalies and get pushed to the top 3% Red flags.
        records = []
        for i in range(100):
            records.append({
                'id': f'emp_{i}',
                'salary': 5000,
                'attendance': 22,
                'policy_compliance': 100,
                'last_month_commission': 500
            })

        # Trigger explicit 10 Iron Rules (Negative values, Attendance > 31)
        records[1] = {'id': 'emp_1', 'salary': -500} # Red flag
        records[2] = {'id': 'emp_2', 'attendance': 32} # Red flag
        records[3] = {'id': 'emp_3', 'last_month_commission': -100} # Red flag

        results = audit_vendor_commissions(records)
        anomalies = [r for r in results if r['status'] != 'Green']

        # 100 items -> Top 3% = 3 items
        self.assertEqual(len(anomalies), 3)
        for anomaly in anomalies:
            self.assertEqual(anomaly['status'], 'Red')

        anomaly_ids = [r['id'] for r in anomalies]
        self.assertIn('emp_1', anomaly_ids)
        self.assertIn('emp_2', anomaly_ids)
        self.assertIn('emp_3', anomaly_ids)

    def test_10_iron_rules_and_top_3_strictness(self):
        # Ensuring that even if there are multiple minor anomalies, exactly the Top 3% most extreme items are highlighted.
        records = []
        for i in range(200):
            records.append({
                'id': f'emp_{i}',
                'salary': 5000 + (i * 10), # Growing salary
                'attendance': 20,
                'policy_compliance': 100,
                'last_month_commission': 500
            })

        # Top 3% of 200 = 6 items
        results = audit_vendor_commissions(records)
        anomalies = [r for r in results if r['status'] != 'Green']
        self.assertEqual(len(anomalies), 6)

        # Check that the 6 items are the ones with the largest salary
        anomaly_ids = [r['id'] for r in anomalies]
        for i in range(194, 200):
            self.assertIn(f'emp_{i}', anomaly_ids)

if __name__ == '__main__':
    unittest.main()
