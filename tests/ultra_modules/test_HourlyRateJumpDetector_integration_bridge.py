import unittest
from decimal import Decimal
from datetime import datetime
from ultra_modules.HourlyRateJumpDetector_integration_bridge import integrate_and_detect, bridge_and_normalize, parse_date, safe_decimal, semantic_fingerprint_mapper

class TestHourlyRateJumpDetectorIntegrationBridge(unittest.TestCase):

    def test_normal_schema_v1(self):
        """Standard data processing with v1 schema."""
        records = [
            {
                "id": "1",
                "project_id": "P1",
                "job_type": "J1",
                "hourly_rate": "20.50",
                "settlement_date": "2023-10-05",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31"
            },
            {
                "id": "2",
                "project_id": "P1",
                "job_type": "J1",
                "hourly_rate": "25.00",  # Jump ratio 4.5/20.5 = ~0.219 (under 0.5)
                "settlement_date": "2023-10-10",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31"
            }
        ]
        anomalies = integrate_and_detect(records)
        self.assertEqual(len(anomalies), 0)

    def test_schema_forward_compatibility(self):
        """Tests cross-system data contract bridge and schema version forward compatibility."""
        records = [
            {
                # V2 schema with camelCase and different names
                "uuid": "3",
                "projectId": "P2",
                "position": "J2",
                "unit_price": 30.00,
                "workDate": "2023-10-01",
                "valid_from": "2023-10-01",
                "valid_to": "2023-10-31"
            },
            {
                "record_id": "4",
                "projId": "P2",
                "jobType": "J2",
                "rate": "50.00",  # Jump ratio 20/30 = 0.66 > 0.5
                "settlementDate": "2023-10-15T00:00:00Z",
                "startDate": "2023-10-01",
                "endDate": "2023-10-31"
            }
        ]
        anomalies = integrate_and_detect(records)
        self.assertEqual(len(anomalies), 1)
        self.assertEqual(anomalies[0]["type"], "RATE_JUMP_ABNORMAL")
        self.assertEqual(anomalies[0]["record_id"], "4")

    def test_dirty_data_self_healing(self):
        """Handling invalid strings, negative numbers, missing data types."""
        records = [
            "invalid_string_not_dict",
            {
                "id": "5",
                "project_id": "P3",
                "hourly_rate": "invalid_decimal",
                "settlement_date": "bad_date",
                "policy_start_date": "bad_date",
                "policy_end_date": "bad_date"
            },
            {
                "id": "6",
                "project_id": "P3",
                "hourly_rate": -15.5,  # Negative rates should become 0
                "settlement_date": "2023-11-05"
            }
        ]
        anomalies = integrate_and_detect(records)
        self.assertEqual(len(anomalies), 0)

        normalized = bridge_and_normalize(records)
        self.assertEqual(len(normalized), 2)
        self.assertEqual(normalized[0]['hourly_rate'], Decimal('0.0'))
        self.assertEqual(normalized[1]['hourly_rate'], Decimal('0.0'))

        # Test input not list
        anomalies_none = integrate_and_detect(None)
        self.assertEqual(anomalies_none, [])

    def test_missing_parameter_fallbacks(self):
        """Handling missing parameters with sensible defaults (like auto-generating `id`)."""
        records = [
            {
                "settlement_date": "2023-10-15"
            }
        ]
        normalized = bridge_and_normalize(records)
        self.assertEqual(len(normalized), 1)
        self.assertTrue(normalized[0]['id']) # Should generate uuid
        self.assertEqual(normalized[0]['project_id'], 'UNKNOWN_PROJECT')
        self.assertEqual(normalized[0]['job_type'], 'UNKNOWN_JOB')
        self.assertEqual(normalized[0]['hourly_rate'], Decimal('0.0'))

    def test_extreme_edge_cases(self):
        """Tests large numeric precisions and extreme chronological boundaries."""
        records = [
            # Policy Out of bounds early
            {
                "id": "7",
                "project": "P4",
                "settlement_date": "2023-09-30",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31",
                "amount": "100000000000.55"  # Large precision
            },
            # Policy Out of bounds late
            {
                "id": "8",
                "project": "P4",
                "settlement_date": "2023-11-01",
                "policy_start_date": "2023-10-01",
                "policy_end_date": "2023-10-31",
                "amount": "200000000000.99" # Large precision, jump ratio ~1.0
            }
        ]
        anomalies = integrate_and_detect(records)

        out_of_bounds = [a for a in anomalies if a['type'] == 'POLICY_OUT_OF_BOUNDS']
        jumps = [a for a in anomalies if a['type'] == 'RATE_JUMP_ABNORMAL']

        self.assertEqual(len(out_of_bounds), 2)
        self.assertEqual(out_of_bounds[0]['record_id'], "7")
        self.assertEqual(out_of_bounds[1]['record_id'], "8")

        self.assertEqual(len(jumps), 1)
        self.assertEqual(jumps[0]['record_id'], "8")

    def test_helper_functions_coverage(self):
        self.assertEqual(parse_date("2023/10/05"), datetime(2023, 10, 5))
        self.assertEqual(safe_decimal(Decimal('10.5')), Decimal('10.5'))
        self.assertEqual(safe_decimal(Decimal('-10.5')), Decimal('0.0'))

        # Test semantic_fingerprint_mapper directly
        mapped = semantic_fingerprint_mapper({"uuid": "test", "work_date": "2023"})
        self.assertEqual(mapped["id"], "test")
        self.assertEqual(mapped["settlement_date"], "2023")

if __name__ == '__main__':
    unittest.main()
