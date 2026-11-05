import unittest
import time
from typing import Dict, Any, List

from ultra_modules.fuzzy_header_fingerprint_self_healing_guard import FuzzyHeaderGuard

class TestFuzzyHeaderGuard(unittest.TestCase):
    def setUp(self):
        self.guard = FuzzyHeaderGuard()

    def test_normal_matching(self):
        # Normal inputs that match perfectly
        headers = ["实发工资", "应发工资", "打卡天数", "工号", "其他列"]
        mapping, snapshot_id = self.guard.match_headers(headers)

        self.assertEqual(mapping.get("net_salary"), "实发工资")
        self.assertEqual(mapping.get("gross_salary"), "应发工资")
        self.assertEqual(mapping.get("attendance_days"), "打卡天数")
        self.assertEqual(mapping.get("employee_id"), "工号")
        self.assertIsNotNone(snapshot_id)

    def test_dirty_data_self_healing(self):
        # Dirty data with spaces, newlines, and non-string types
        headers = [" 实 发\n工资 ", "应 发  工 资", "  打卡天数\n", 123, None, "其他"]
        mapping, snapshot_id = self.guard.match_headers(headers)

        self.assertEqual(mapping.get("net_salary"), " 实 发\n工资 ")
        self.assertEqual(mapping.get("gross_salary"), "应 发  工 资")
        self.assertEqual(mapping.get("attendance_days"), "  打卡天数\n")
        self.assertIsNone(mapping.get("employee_id"))  # '123' does not match '工号'
        self.assertIsNotNone(snapshot_id)

    def test_missing_params_fallback(self):
        # Missing parameter fallback (None passed instead of list)
        mapping, snapshot_id = self.guard.match_headers(None)

        self.assertEqual(mapping, {})
        self.assertIsNotNone(snapshot_id)

        # Test extreme boundaries with incorrect data types in list
        headers = [1, 2.5, True, {}, []]
        mapping, snapshot_id = self.guard.match_headers(headers)
        self.assertEqual(mapping, {})
        self.assertIsNotNone(snapshot_id)

    def test_snapshot_lifecycle_undo(self):
        # Save snapshot and test immediate restore
        headers = ["实发工资", "应发工资"]
        mapping, snapshot_id = self.guard.match_headers(headers)

        original_state = self.guard.undo(snapshot_id)
        self.assertIsNotNone(original_state)
        self.assertEqual(original_state["original_input"], headers)

        # Subsequent restores should fail
        self.assertIsNone(self.guard.undo(snapshot_id))

    def test_snapshot_expiration(self):
        # Test expiration. Change ttl to a very short time for testing purposes.
        headers = ["工号"]
        mapping, snapshot_id = self.guard.match_headers(headers)

        # Temporarily mock the created_at of snapshot to force expiration
        snapshot = self.guard.snapshot_manager.snapshots[snapshot_id]
        snapshot.created_at = time.time() - 10  # Set creation time to 10 seconds ago

        # Restore should fail due to expiration
        original_state = self.guard.undo(snapshot_id)
        self.assertIsNone(original_state)

    def test_fuzzy_matching(self):
        # Semantic matching for incomplete/scrambled matches
        headers = ["发工资实", "发工资应", "天数打卡", "号工", "不知所云"]
        mapping, snapshot_id = self.guard.match_headers(headers)

        self.assertEqual(mapping.get("net_salary"), "发工资实")
        self.assertEqual(mapping.get("gross_salary"), "发工资应")
        self.assertEqual(mapping.get("attendance_days"), "天数打卡")
        self.assertEqual(mapping.get("employee_id"), "号工")

if __name__ == "__main__":
    unittest.main()
