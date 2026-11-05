import unittest
from ultra_modules.utility_fee_room_splitter_integration_bridge import UtilityFeeSplitter

class TestUtilityFeeSplitter(unittest.TestCase):

    def test_normal_old_schema(self):
        """Test with old schema (days) and normal data."""
        splitter = UtilityFeeSplitter()
        residents = [
            {"id": "user1", "days": 10},
            {"id": "user2", "days": 20},
        ]
        result = splitter.calculate_splits(300, residents)

        self.assertEqual(result["total_fee"], 300.0)
        self.assertEqual(result["total_days"], 30)
        self.assertEqual(len(result["splits"]), 2)

        splits_dict = {s["id"]: s["fee"] for s in result["splits"]}
        self.assertAlmostEqual(splits_dict["user1"], 100.0)
        self.assertAlmostEqual(splits_dict["user2"], 200.0)
        self.assertEqual(result["unallocated_fee"], 0.0)

        # Verify audit log exists
        self.assertTrue(len(splitter.get_audit_log()) > 0)

    def test_normal_new_schema(self):
        """Test with new schema (days_lived or actual_days) and normal data."""
        splitter = UtilityFeeSplitter()
        residents = [
            {"user_id": "u1", "days_lived": 15},
            {"resident_id": "u2", "actual_days": 15},
        ]
        # Fee provided as nested struct
        total_fee = {"amount": 600}

        result = splitter.calculate_splits(total_fee, residents)
        self.assertEqual(result["total_fee"], 600.0)
        self.assertEqual(result["total_days"], 30)

        splits_dict = {s["id"]: s["fee"] for s in result["splits"]}
        self.assertAlmostEqual(splits_dict["u1"], 300.0)
        self.assertAlmostEqual(splits_dict["u2"], 300.0)

    def test_dirty_data_self_healing(self):
        """Test dirty data (strings, negative, missing, duplicates) self-healing."""
        splitter = UtilityFeeSplitter()
        residents = [
            {"id": "u1", "days": "10.5"}, # string float
            {"id": "u2", "days": -5},     # negative (should be 0)
            {"id": "u3"},                 # missing days
            {"id": "u1", "days": 100},    # duplicate id (should be ignored)
            {"days": "invalid"}           # missing id and invalid days
        ]

        result = splitter.calculate_splits("100.0", residents)

        self.assertEqual(result["total_fee"], 100.0)
        # u1 -> 10, u2 -> 0, u3 -> 0, unknown_0 -> 0 (from invalid days)
        # Total days = 10
        self.assertEqual(result["total_days"], 10)
        self.assertEqual(len(result["splits"]), 4) # 4 unique ids

        splits_dict = {s["id"]: s["fee"] for s in result["splits"]}
        self.assertAlmostEqual(splits_dict["u1"], 100.0)
        self.assertAlmostEqual(splits_dict["u2"], 0.0)
        self.assertAlmostEqual(splits_dict["u3"], 0.0)

        # Check audit log for deduplication
        audit = splitter.get_audit_log()
        duplicate_logs = [log for log in audit if log["action"] == "duplicate_resident_ignored"]
        self.assertEqual(len(duplicate_logs), 1)

    def test_missing_parameter_fallbacks(self):
        """Test missing parameter fallbacks (empty list, none fee, no config)."""
        splitter = UtilityFeeSplitter()

        # No residents, no fee
        result = splitter.calculate_splits(None, None)
        self.assertEqual(result["total_fee"], 0.0)
        self.assertEqual(result["total_days"], 0)
        self.assertEqual(result["unallocated_fee"], 0.0)
        self.assertEqual(len(result["splits"]), 0)

        # Total days is 0 fallback
        residents = [{"id": "u1", "days": 0}, {"id": "u2", "days": 0}]
        result_unallocated = splitter.calculate_splits(100, residents)
        self.assertEqual(result_unallocated["unallocated_fee"], 100.0)

        # Total days is 0 fallback with 'even'
        result_even = splitter.calculate_splits(100, residents, {"zero_days_fallback": "even"})
        self.assertEqual(result_even["unallocated_fee"], 0.0)
        splits_dict = {s["id"]: s["fee"] for s in result_even["splits"]}
        self.assertAlmostEqual(splits_dict["u1"], 50.0)
        self.assertAlmostEqual(splits_dict["u2"], 50.0)

    def test_extreme_boundaries(self):
        """Test extreme boundaries (rounding issues, many residents)."""
        splitter = UtilityFeeSplitter()
        # 3 residents, 1 day each, fee is 100 (100 / 3 = 33.333...)
        residents = [
            {"id": "u1", "days": 1},
            {"id": "u2", "days": 1},
            {"id": "u3", "days": 1},
        ]

        result = splitter.calculate_splits(100, residents, {"precision": 2})
        self.assertEqual(result["total_fee"], 100.0)

        splits = result["splits"]
        # Due to rounding and last-person remainder:
        # u1 -> 33.33, u2 -> 33.33, u3 -> 100 - (33.33+33.33) = 33.34
        self.assertAlmostEqual(splits[0]["fee"], 33.33)
        self.assertAlmostEqual(splits[1]["fee"], 33.33)
        self.assertAlmostEqual(splits[2]["fee"], 33.34)

        total_allocated = sum(s["fee"] for s in splits)
        self.assertAlmostEqual(total_allocated, 100.0)
        self.assertEqual(result["unallocated_fee"], 0.0)

if __name__ == '__main__':
    unittest.main()
