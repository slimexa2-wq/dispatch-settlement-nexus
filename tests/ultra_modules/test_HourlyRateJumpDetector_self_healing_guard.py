import unittest
import time
from datetime import datetime
from ultra_modules.HourlyRateJumpDetector_self_healing_guard import HourlyRateJumpGuard

class TestHourlyRateJumpGuard(unittest.TestCase):
    def setUp(self):
        self.guard = HourlyRateJumpGuard(jump_threshold_ratio=0.5)

    def test_normal_standard_processing(self):
        """Test normal processing where there are no anomalies."""
        records = [
            {
                "id": "rec_1",
                "project_id": "P1",
                "job_type": "J1",
                "hourly_rate": 10.0,
                "settlement_date": "2023-10-01",
                "policy_start_date": "2023-01-01",
                "policy_end_date": "2023-12-31"
            },
            {
                "id": "rec_2",
                "project_id": "P1",
                "job_type": "J1",
                "hourly_rate": 12.0, # 20% jump, less than 50% threshold
                "settlement_date": "2023-10-15",
                "policy_start_date": "2023-01-01",
                "policy_end_date": "2023-12-31"
            }
        ]

        result = self.guard.check_anomalies(records)
        self.assertTrue(result["success"])
        self.assertEqual(len(result["anomalies"]), 0)
        self.assertIn("snapshot_id", result)

    def test_dirty_data_self_healing(self):
        """Test the system silently self-heals dirty data."""
        records = [
            "completely_invalid_record_string",
            {
                "id": "rec_3",
                "project_id": "P2",
                "hourly_rate": "invalid_rate", # should become 0.0
                "settlement_date": "not_a_date",
                "policy_start_date": "not_a_date"
            },
            {
                "id": "rec_4",
                "project_id": "P2",
                "hourly_rate": -50.0, # should be floored to 0.0
                "settlement_date": "2023-10-01"
            }
        ]

        # Test input not a list
        result_none = self.guard.check_anomalies(None)
        self.assertTrue(result_none["success"])
        self.assertEqual(len(result_none["anomalies"]), 0)

        # Test dirty records
        result = self.guard.check_anomalies(records)
        self.assertTrue(result["success"])
        self.assertEqual(len(result["anomalies"]), 0)

    def test_default_fallback_missing_parameters(self):
        """Test default fallbacks when parameters are missing."""
        records = [
            {
                # missing everything
            },
            {
                "settlement_date": "2023-10-10"
                # missing policy dates -> no out of bounds
            }
        ]

        result = self.guard.check_anomalies(records)
        self.assertTrue(result["success"])
        self.assertEqual(len(result["anomalies"]), 0)

    def test_extreme_boundary_cases(self):
        """Test rate jumps and out-of-bounds dates."""
        records = [
            # Policy Out of bounds early
            {
                "id": "early_1",
                "settlement_date": "2023-01-01",
                "policy_start_date": "2023-02-01",
                "policy_end_date": "2023-12-31"
            },
            # Policy Out of bounds late
            {
                "id": "late_1",
                "settlement_date": "2024-01-01",
                "policy_start_date": "2023-02-01",
                "policy_end_date": "2023-12-31"
            },
            # Rate jump > 50%
            {
                "id": "jump_1",
                "project_id": "P3",
                "job_type": "J3",
                "hourly_rate": 10.0,
                "settlement_date": "2023-05-01",
                "policy_start_date": "2023-01-01",
                "policy_end_date": "2023-12-31"
            },
            {
                "id": "jump_2",
                "project_id": "P3",
                "job_type": "J3",
                "hourly_rate": 16.0, # 60% jump
                "settlement_date": "2023-05-15",
                "policy_start_date": "2023-01-01",
                "policy_end_date": "2023-12-31"
            }
        ]

        result = self.guard.check_anomalies(records)
        self.assertTrue(result["success"])
        anomalies = result["anomalies"]

        self.assertEqual(len(anomalies), 3)

        out_of_bounds = [a for a in anomalies if a["type"] == "POLICY_OUT_OF_BOUNDS"]
        self.assertEqual(len(out_of_bounds), 2)
        self.assertEqual(out_of_bounds[0]["record_id"], "early_1")
        self.assertEqual(out_of_bounds[1]["record_id"], "late_1")

        rate_jumps = [a for a in anomalies if a["type"] == "RATE_JUMP_ABNORMAL"]
        self.assertEqual(len(rate_jumps), 1)
        self.assertEqual(rate_jumps[0]["record_id"], "jump_2")

    def test_snapshot_undo_mechanism(self):
        """Test the 5-second one-click undo mechanism."""
        records = [{"id": "test_rec", "hourly_rate": 100}]

        # 1. Normal undo within 5 seconds
        result1 = self.guard.check_anomalies(records)
        snapshot_id = result1["snapshot_id"]

        undo_res1 = self.guard.undo(snapshot_id)
        self.assertTrue(undo_res1["success"])
        self.assertEqual(undo_res1["reverted_records_count"], 1)

        # 2. Undo invalid snapshot id
        undo_res2 = self.guard.undo("invalid_id")
        self.assertFalse(undo_res2["success"])
        self.assertEqual(undo_res2["message"], "Snapshot not found")

        # 3. Undo window expired
        result3 = self.guard.check_anomalies(records)
        snapshot_id3 = result3["snapshot_id"]

        # Manually alter the timestamp to simulate 6 seconds passing
        self.guard._snapshots[snapshot_id3]["timestamp"] -= 6.0

        undo_res3 = self.guard.undo(snapshot_id3)
        self.assertFalse(undo_res3["success"])
        self.assertEqual(undo_res3["message"], "Undo window expired")

if __name__ == '__main__':
    unittest.main()
