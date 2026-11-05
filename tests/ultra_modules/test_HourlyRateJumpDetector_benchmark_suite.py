import unittest
import datetime
from ultra_modules.HourlyRateJumpDetector_benchmark_suite import HourlyRateJumpDetector, BenchmarkSuite

class TestHourlyRateJumpDetector(unittest.TestCase):
    def setUp(self):
        self.detector = HourlyRateJumpDetector()
        self.base_time = datetime.datetime(2023, 1, 1)

    def test_normal_case_no_anomalies(self):
        records = [
            {
                'project_id': 'PROJ_A',
                'job_type': 'DEV',
                'hourly_rate': 20.0,
                'policy_start': self.base_time,
                'policy_end': self.base_time + datetime.timedelta(days=365),
                'settlement_date': self.base_time + datetime.timedelta(days=10)
            },
            {
                'project_id': 'PROJ_A',
                'job_type': 'DEV',
                'hourly_rate': 21.0, # Normal fluctuation
                'policy_start': self.base_time,
                'policy_end': self.base_time + datetime.timedelta(days=365),
                'settlement_date': self.base_time + datetime.timedelta(days=11)
            }
        ]
        anomalies = self.detector.detect_anomalies(records)
        self.assertEqual(len(anomalies), 0)

    def test_dirty_data_self_healing(self):
        records = [
            {
                'project_id': None, # Dirty
                'job_type': 123, # Dirty
                'hourly_rate': 'invalid_rate', # Dirty
                'policy_start': 'bad_date', # Dirty
                'policy_end': None, # Dirty
                'settlement_date': None # Dirty
            },
            {
                'project_id': None,
                'job_type': 123,
                'hourly_rate': -100, # Invalid negative rate
                'policy_start': 'bad_date',
                'policy_end': None,
                'settlement_date': None
            }
        ]
        # Should execute silently and self-heal
        anomalies = self.detector.detect_anomalies(records)
        # Assuming defaults don't trigger jumps out of thin air, though date fallback might hit bounds
        # Check that it doesn't crash
        self.assertTrue(isinstance(anomalies, list))

    def test_missing_parameter_fallbacks(self):
        # Even when records are completely empty or missing required keys, it should fallback
        records = [
            {}, # Missing everything
            {'hourly_rate': 15.0}, # Missing dates and IDs
            {'project_id': 'PROJ_B'} # Missing rates and dates
        ]
        anomalies = self.detector.detect_anomalies(records)
        self.assertTrue(isinstance(anomalies, list))

    def test_out_of_bounds_policy(self):
        records = [
            {
                'project_id': 'PROJ_B',
                'job_type': 'QA',
                'hourly_rate': 20.0,
                'policy_start': self.base_time,
                'policy_end': self.base_time + datetime.timedelta(days=30),
                'settlement_date': self.base_time + datetime.timedelta(days=60) # Out of bounds
            }
        ]
        anomalies = self.detector.detect_anomalies(records)
        self.assertEqual(len(anomalies), 1)
        self.assertTrue(anomalies[0]['policy_out_of_bounds'])

    def test_extreme_boundary_and_performance_benchmark(self):
        # Assert milliseconds response for large concurrency sets
        result = BenchmarkSuite.run_benchmark(num_records=100000)
        self.assertEqual(result['num_records'], 100000)
        self.assertTrue(result['duration_ms'] < 5000, f"Benchmark took too long: {result['duration_ms']} ms")
        self.assertTrue(result['anomalies_found'] > 0)

    def test_rate_jump_anomaly(self):
        records = [
            {
                'project_id': 'PROJ_C',
                'job_type': 'MANAGER',
                'hourly_rate': 20.0,
                'policy_start': self.base_time,
                'policy_end': self.base_time + datetime.timedelta(days=365),
                'settlement_date': self.base_time + datetime.timedelta(days=1)
            },
            {
                'project_id': 'PROJ_C',
                'job_type': 'MANAGER',
                'hourly_rate': 100.0, # Jump > 50%
                'policy_start': self.base_time,
                'policy_end': self.base_time + datetime.timedelta(days=365),
                'settlement_date': self.base_time + datetime.timedelta(days=2)
            }
        ]
        anomalies = self.detector.detect_anomalies(records)
        self.assertEqual(len(anomalies), 1)
        self.assertTrue(anomalies[0]['is_jump_abnormal'])
        self.assertEqual(anomalies[0]['jump_ratio'], 4.0)

if __name__ == '__main__':
    unittest.main()
