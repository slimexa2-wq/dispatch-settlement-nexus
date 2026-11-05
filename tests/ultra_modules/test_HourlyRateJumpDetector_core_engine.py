import unittest
from datetime import datetime
from ultra_modules.HourlyRateJumpDetector_core_engine import check_hourly_rate_anomalies, parse_date, safe_float

class TestHourlyRateJumpDetector(unittest.TestCase):
    def test_normal_records(self):
        records = [
            {
                "id": "1",
                "project_id": "P1",
                "job_type": "J1",
                "hourly_rate": 20.0,
                "settlement_date": "2023-10-05",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31"
            },
            {
                "id": "2",
                "project_id": "P1",
                "job_type": "J1",
                "hourly_rate": 22.0, # Jump ratio 2/20 = 0.1, under 0.5 default threshold
                "settlement_date": "2023-10-10",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31"
            }
        ]
        anomalies = check_hourly_rate_anomalies(records)
        self.assertEqual(len(anomalies), 0)

    def test_dirty_data_self_healing(self):
        records = [
            "invalid_record_string",
            {
                "id": "3",
                "project_id": "P2",
                "job_type": "J2",
                "hourly_rate": "invalid_float",
                "settlement_date": "invalid_date",
                "policy_start_date": "invalid_date",
                "policy_end_date": "invalid_date"
            },
            {
                "id": "4",
                "project_id": "P2",
                "job_type": "J2",
                "hourly_rate": -10.0, # Should be floored to 0.0 or ignored
                "settlement_date": "2023-10-05T12:00:00Z"
            }
        ]
        # Shouldn't crash, should return empty anomalies
        anomalies = check_hourly_rate_anomalies(records)
        self.assertEqual(len(anomalies), 0)

        # Test input not list
        anomalies_none = check_hourly_rate_anomalies(None)
        self.assertEqual(anomalies_none, [])

    def test_missing_parameter_fallbacks(self):
        records = [
            {
                "id": "5"
                # missing all fields
            },
            {
                "id": "6",
                "settlement_date": "2023-10-15"
                # Missing policy dates -> won't trigger out of bounds
            }
        ]
        anomalies = check_hourly_rate_anomalies(records)
        self.assertEqual(len(anomalies), 0)

    def test_rate_jump_boundary_checks(self):
        records = [
            {
                "id": "7",
                "project_id": "P3",
                "job_type": "J3",
                "hourly_rate": 10.0,
                "settlement_date": "2023-10-01"
            },
            {
                "id": "8",
                "project_id": "P3",
                "job_type": "J3",
                "hourly_rate": 16.0, # 6/10 = 0.6 > 0.5 threshold
                "settlement_date": "2023-10-10"
            }
        ]
        anomalies = check_hourly_rate_anomalies(records)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0]['type'], "RATE_JUMP_ABNORMAL")
        self.assertEqual(anomalies[0]['record_id'], "8")

        # Custom threshold check
        anomalies_custom = check_hourly_rate_anomalies(records, jump_threshold_ratio=0.7)
        self.assertEqual(len(anomalies_custom), 0)

    def test_extreme_edge_cases(self):
        records = [
            # Policy Out of bounds early
            {
                "id": "9",
                "settlement_date": "2023-09-30",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31"
            },
            # Policy Out of bounds late
            {
                "id": "10",
                "settlement_date": "2023-11-01",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31"
            },
            # No ID fallback
            {
                "settlement_date": "2023-08-01",
                "policy_start_date": "2023-09-01"
            },
            # Same day settlements out of order (chronological test)
            {
                "id": "12",
                "project_id": "P4",
                "job_type": "J4",
                "hourly_rate": 30.0,
                "settlement_date": "2023-12-02"
            },
            {
                "id": "11",
                "project_id": "P4",
                "job_type": "J4",
                "hourly_rate": 10.0,
                "settlement_date": "2023-12-01"
            }
        ]
        anomalies = check_hourly_rate_anomalies(records)

        # 3 out of bounds, 1 jump
        out_of_bounds = [a for a in anomalies if a['type'] == 'POLICY_OUT_OF_BOUNDS']
        jumps = [a for a in anomalies if a['type'] == 'RATE_JUMP_ABNORMAL']

        self.assertEqual(len(out_of_bounds), 3)
        self.assertEqual(out_of_bounds[0]['record_id'], "9")
        self.assertEqual(out_of_bounds[1]['record_id'], "10")
        self.assertEqual(out_of_bounds[2]['record_id'], "idx_2")

        self.assertEqual(len(jumps), 1)
        self.assertEqual(jumps[0]['record_id'], "12") # It jumped from 10 to 30

    def test_parse_date_and_safe_float_coverage(self):
        # coverage for helper methods
        self.assertIsNone(parse_date(None))
        self.assertIsNone(parse_date(""))
        self.assertIsNone(parse_date(123))
        dt = datetime.now()
        self.assertEqual(parse_date(dt), dt)

        self.assertEqual(safe_float("12.5"), 12.5)
        self.assertEqual(safe_float(None, 1.0), 1.0)
        self.assertEqual(safe_float(-5.0), 0.0)

if __name__ == '__main__':
    unittest.main()
