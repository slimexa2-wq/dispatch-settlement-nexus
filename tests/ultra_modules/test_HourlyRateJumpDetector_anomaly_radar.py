import unittest
import datetime
from ultra_modules.HourlyRateJumpDetector_anomaly_radar import HourlyRateAnomalyRadar

class TestHourlyRateAnomalyRadar(unittest.TestCase):

    def setUp(self):
        self.radar = HourlyRateAnomalyRadar()
        self.current_date = datetime.date(2025, 1, 15)

    def test_normal_case(self):
        # Normal data within range, active policy
        records = [
            {'id': '1', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 20.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '2', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 21.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '3', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 19.5, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '4', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 20.5, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
        ]

        results = self.radar.scan_anomalies(records, current_date=self.current_date)

        self.assertEqual(len(results), 4)
        for r in results:
            self.assertEqual(r['marker'], 'Green')
            self.assertFalse(r['is_top_anomaly'])
            self.assertEqual(r['reason'], "")

        logs = self.radar.get_audit_log()
        self.assertTrue(any(log['action'] == 'scan_started' for log in logs))
        self.assertTrue(any(log['action'] == 'scan_completed' for log in logs))

    def test_dirty_data_self_healing_and_missing_fallback(self):
        # Dirty data, missing parameters, invalid values
        records = [
            {'id': '1'}, # Missing everything
            {'id': '2', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 'invalid', 'policy_start': '', 'policy_end': None},
            {'id': '3', 'hourly_rate': None},
        ]

        results = self.radar.scan_anomalies(records, current_date=self.current_date)

        self.assertEqual(len(results), 3)
        # They should all default to 0.0 rate, same default project/job_type, and active policy
        for r in results:
            self.assertEqual(r['hourly_rate'], 0.0)
            self.assertEqual(r['marker'], 'Green')
            self.assertFalse(r['is_top_anomaly'])

        logs = self.radar.get_audit_log()
        self.assertTrue(any(log['action'] == 'heal_data' for log in logs))

    def test_top_3_percent_anomaly_iqr(self):
        # Generate 100 records for the same project and job type
        # 99 normal records around 20.0, 1 extreme outlier
        records = []
        for i in range(1, 100):
            records.append({
                'id': f'norm_{i}', 'project': 'P_BIG', 'job_type': 'J_BIG',
                'hourly_rate': 20.0 + (i % 3 - 1) * 0.5, # 19.5, 20.0, 20.5
                'policy_start': '2025-01-01', 'policy_end': '2025-12-31'
            })

        # Add 1 extreme outlier
        records.append({
            'id': 'outlier_1', 'project': 'P_BIG', 'job_type': 'J_BIG',
            'hourly_rate': 150.0,
            'policy_start': '2025-01-01', 'policy_end': '2025-12-31'
        })

        results = self.radar.scan_anomalies(records, current_date=self.current_date)

        self.assertEqual(len(results), 100)

        outlier = next(r for r in results if r['id'] == 'outlier_1')
        self.assertEqual(outlier['marker'], 'Red')
        self.assertTrue(outlier['is_top_anomaly'])
        self.assertTrue("单价偏离同工种正常范围" in outlier['reason'])

        normals = [r for r in results if r['id'] != 'outlier_1']
        for r in normals:
            self.assertEqual(r['marker'], 'Green')
            self.assertFalse(r['is_top_anomaly'])

    def test_policy_out_of_bounds(self):
        # Policy is expired or not yet started
        records = [
            {'id': '1', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 20.0, 'policy_start': '2024-01-01', 'policy_end': '2024-12-31'}, # Expired
            {'id': '2', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 20.0, 'policy_start': '2026-01-01', 'policy_end': '2026-12-31'}, # Future
            {'id': '3', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 20.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'}, # Active
        ]

        results = self.radar.scan_anomalies(records, current_date=self.current_date)

        expired = next(r for r in results if r['id'] == '1')
        future = next(r for r in results if r['id'] == '2')
        active = next(r for r in results if r['id'] == '3')

        self.assertNotEqual(expired['marker'], 'Green')
        self.assertTrue("政策有效期越界" in expired['reason'])
        self.assertTrue(expired['is_top_anomaly']) # Top anomaly among these

        self.assertNotEqual(future['marker'], 'Green')
        self.assertTrue("政策有效期越界" in future['reason'])

        self.assertEqual(active['marker'], 'Green')

    def test_z_score_fallback_and_extreme_jump(self):
        # Test fallback when IQR is 0 but std is not, or when n < 4
        # Create enough normal records so id 2 is clearly the anomaly
        records = [
            {'id': '1', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 10.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '1_a', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 10.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '1_b', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 10.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '1_c', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 10.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '1_d', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 10.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'},
            {'id': '2', 'project': 'P1', 'job_type': 'J1', 'hourly_rate': 150.0, 'policy_start': '2025-01-01', 'policy_end': '2025-12-31'}, # Huge jump
        ]

        results = self.radar.scan_anomalies(records, current_date=self.current_date)

        jump = next(r for r in results if r['id'] == '2')
        # We accept 'Yellow' or 'Red' as long as it's correctly flagged as top anomaly
        self.assertTrue(jump['marker'] in ['Red', 'Yellow'])
        self.assertTrue(jump['is_top_anomaly'])
        self.assertTrue("偏离" in jump['reason'] or "跳变" in jump['reason'] or "波动" in jump['reason'])

if __name__ == '__main__':
    unittest.main()
