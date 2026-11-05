import unittest
import os
import json
import csv
import datetime
from ultra_modules.HourlyRateJumpDetector_cli_one_click import HourlyRateJumpDetector, OutputAdapter

class TestHourlyRateJumpDetector(unittest.TestCase):
    def setUp(self):
        self.detector = HourlyRateJumpDetector(jump_threshold_ratio=0.2)

    def test_clean_dirty_data_defaults(self):
        # Missing project, job_title, invalid rate, missing dates
        dirty_data = [
            {"rate": "invalid_rate"}
        ]
        anomalies = self.detector.detect(dirty_data)
        self.assertEqual(len(anomalies), 0)

        # Test clean explicitly to check defaults
        cleaned = self.detector._clean_data(dirty_data[0])
        self.assertEqual(cleaned['project'], 'DEFAULT_PROJECT')
        self.assertEqual(cleaned['job_title'], 'DEFAULT_JOB')
        self.assertEqual(cleaned['rate'], 0.0)
        self.assertEqual(cleaned['date'], datetime.date.today().isoformat())
        self.assertEqual(cleaned['policy_start'], '2000-01-01')
        self.assertEqual(cleaned['policy_end'], '2099-12-31')

    def test_date_out_of_bounds(self):
        data = [
            {"project": "P1", "job_title": "J1", "rate": 100, "date": "2023-05-01", "policy_start": "2023-01-01", "policy_end": "2023-04-30"}
        ]
        anomalies = self.detector.detect(data)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0]['anomaly_reasons'], 'DATE_OUT_OF_BOUNDS')

    def test_rate_jump_detection(self):
        data = [
            {"project": "P1", "job_title": "J1", "rate": 100, "date": "2023-01-01", "policy_start": "2023-01-01", "policy_end": "2023-12-31"},
            {"project": "P1", "job_title": "J1", "rate": 110, "date": "2023-02-01", "policy_start": "2023-01-01", "policy_end": "2023-12-31"}, # 10% jump - ok
            {"project": "P1", "job_title": "J1", "rate": 135, "date": "2023-03-01", "policy_start": "2023-01-01", "policy_end": "2023-12-31"}, # (135-110)/110 = 22.7% jump - anomaly
        ]
        anomalies = self.detector.detect(data)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0]['rate'], 135)
        self.assertEqual(anomalies[0]['anomaly_reasons'], 'RATE_JUMP_DETECTED')

    def test_multiple_anomalies_same_record(self):
        data = [
            {"project": "P1", "job_title": "J1", "rate": 100, "date": "2023-01-01", "policy_start": "2023-01-01", "policy_end": "2023-02-28"},
            {"project": "P1", "job_title": "J1", "rate": 150, "date": "2023-03-01", "policy_start": "2023-01-01", "policy_end": "2023-02-28"},
        ]
        anomalies = self.detector.detect(data)
        self.assertEqual(len(anomalies), 1)
        self.assertIn('DATE_OUT_OF_BOUNDS', anomalies[0]['anomaly_reasons'])
        self.assertIn('RATE_JUMP_DETECTED', anomalies[0]['anomaly_reasons'])

    def test_output_adapters(self):
        data = [
            {"project": "P1", "job_title": "J1", "rate": 100, "date": "2023-01-01", "policy_start": "2023-01-01", "policy_end": "2023-12-31"}
        ]
        json_file = 'test_output.json'
        csv_file = 'test_output.csv'

        try:
            OutputAdapter.export_json(data, json_file)
            OutputAdapter.export_excel_csv(data, csv_file)

            self.assertTrue(os.path.exists(json_file))
            self.assertTrue(os.path.exists(csv_file))

            with open(json_file, 'r', encoding='utf-8') as f:
                loaded_json = json.load(f)
                self.assertEqual(loaded_json[0]['project'], 'P1')

            with open(csv_file, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                rows = list(reader)
                self.assertEqual(rows[0]['project'], 'P1')

        finally:
            if os.path.exists(json_file):
                os.remove(json_file)
            if os.path.exists(csv_file):
                os.remove(csv_file)

if __name__ == '__main__':
    unittest.main()
