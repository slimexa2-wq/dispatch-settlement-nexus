import unittest
from datetime import datetime
from ultra_modules.HourlyRateJumpDetector_audit_trace import HourlyRateJumpDetector

class TestHourlyRateJumpDetector(unittest.TestCase):
    def test_normal_detection(self):
        """Test normal execution with valid data and a jump."""
        records = [
            {'project_id': 'P1', 'job_type': 'J1', 'rate': 100, 'start_date': '2023-01-01', 'end_date': '2023-01-31'},
            {'project_id': 'P1', 'job_type': 'J1', 'rate': 150, 'start_date': '2023-02-01', 'end_date': '2023-02-28'}
        ]
        result = HourlyRateJumpDetector.detect_anomalies(records, jump_threshold=0.3)
        anomalies = result['anomalies']
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0]['type'], 'rate_jump')
        self.assertEqual(anomalies[0]['project_id'], 'P1')
        self.assertEqual(anomalies[0]['diff_highlight']['jump_ratio'], 0.5)

    def test_dirty_data_auto_healing(self):
        """Test with dirty data like invalid dates and rates, and string input where list expected."""
        records = [
            {'project_id': None, 'job_type': '', 'rate': 'invalid', 'start_date': 'bad-date', 'end_date': '2023-01-31'},
            {'project_id': 'P1', 'job_type': 'J1', 'rate': -50, 'start_date': '2023-03-01', 'end_date': '2023-02-01'}, # end before start
            {'project_id': '  ', 'job_type': '   ', 'rate': 100, 'start_date': '2023-01-01', 'end_date': '2023-01-31'}
        ]
        result = HourlyRateJumpDetector.detect_anomalies(records)
        trace = result['audit_trace']

        # Check that bad-date is handled
        self.assertTrue(any("invalid start_date fixed" in msg for msg in trace))
        # Check negative rate fixed to 0
        self.assertTrue(any("negative rate fixed to 0.0" in msg for msg in trace))
        # Check start_date > end_date swapped
        self.assertTrue(any("start_date > end_date swapped" in msg for msg in trace))

        # Test input type mismatch fallback
        result2 = HourlyRateJumpDetector.detect_anomalies("not a list")
        self.assertEqual(result2['anomalies'], [])
        self.assertTrue(any("Input is not a list" in msg for msg in result2['audit_trace']))

        # Test record is not a dict
        result3 = HourlyRateJumpDetector.detect_anomalies(["not a dict"])
        self.assertTrue(any("is not a dict" in msg for msg in result3['audit_trace']))

    def test_missing_params_fallback(self):
        """Test with completely missing parameters."""
        records = [{}]
        result = HourlyRateJumpDetector.detect_anomalies(records, jump_threshold="bad_threshold")
        trace = result['audit_trace']

        # Check default threshold applied
        self.assertTrue(any("Invalid jump_threshold fixed to 0.3" in msg for msg in trace))

        cleaned, _ = HourlyRateJumpDetector.clean_data(records)
        record = cleaned[0]
        self.assertEqual(record['project_id'], 'unknown_project')
        self.assertEqual(record['job_type'], 'unknown_job')
        self.assertEqual(record['rate'], 0.0)
        self.assertEqual(record['start_date'], datetime(1970, 1, 1))
        self.assertEqual(record['end_date'], datetime(2099, 12, 31))

    def test_extreme_boundaries(self):
        """Test extreme values and zero-division cases."""
        records = [
            {'project_id': 'P1', 'job_type': 'J1', 'rate': 0, 'start_date': '2023-01-01', 'end_date': '2023-01-31'},
            {'project_id': 'P1', 'job_type': 'J1', 'rate': 100, 'start_date': '2023-02-01', 'end_date': '2023-02-28'},
            {'project_id': 'P1', 'job_type': 'J1', 'rate': 0, 'start_date': '2023-03-01', 'end_date': '2023-03-31'}
        ]
        result = HourlyRateJumpDetector.detect_anomalies(records, jump_threshold=0.3)
        anomalies = result['anomalies']

        # Jump from 0 to 100
        jump1 = [a for a in anomalies if a['record_1_index'] == 0 and a['record_2_index'] == 1 and a['type'] == 'rate_jump'][0]
        self.assertEqual(jump1['diff_highlight']['jump_ratio'], 'Infinity')

        # Jump from 100 to 0 (jump is 100%, 1.0 > 0.3)
        jump2 = [a for a in anomalies if a['record_1_index'] == 1 and a['record_2_index'] == 2 and a['type'] == 'rate_jump'][0]
        self.assertEqual(jump2['diff_highlight']['jump_ratio'], 1.0)

        # Same rates
        records_same = [
            {'project_id': 'P2', 'job_type': 'J2', 'rate': 0, 'start_date': '2023-01-01', 'end_date': '2023-01-31'},
            {'project_id': 'P2', 'job_type': 'J2', 'rate': 0, 'start_date': '2023-02-01', 'end_date': '2023-02-28'}
        ]
        result_same = HourlyRateJumpDetector.detect_anomalies(records_same)
        self.assertEqual(len([a for a in result_same['anomalies'] if a['type'] == 'rate_jump']), 0)

    def test_overlap_detection(self):
        """Test overlapping validity periods."""
        records = [
            {'project_id': 'P1', 'job_type': 'J1', 'rate': 100, 'start_date': '2023-01-01', 'end_date': '2023-01-31'},
            {'project_id': 'P1', 'job_type': 'J1', 'rate': 100, 'start_date': '2023-01-15', 'end_date': '2023-02-28'}
        ]
        result = HourlyRateJumpDetector.detect_anomalies(records)
        anomalies = result['anomalies']

        overlaps = [a for a in anomalies if a['type'] == 'overlap']
        self.assertEqual(len(overlaps), 1)
        self.assertEqual(overlaps[0]['message'], "Validity period overlap detected.")

if __name__ == '__main__':
    unittest.main()
