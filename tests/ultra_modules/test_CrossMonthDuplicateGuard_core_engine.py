import unittest
import datetime
from ultra_modules.CrossMonthDuplicateGuard_core_engine import guard_cross_month_duplicate, parse_date

class TestCrossMonthDuplicateGuard(unittest.TestCase):

    def test_parse_date_various_formats(self):
        """Test parse_date with different types of inputs and formats."""
        # 1. datetime.date
        d = datetime.date(2023, 1, 15)
        self.assertEqual(parse_date(d), d)

        # 2. datetime.datetime
        dt = datetime.datetime(2023, 1, 15, 12, 30, 0)
        self.assertEqual(parse_date(dt), datetime.date(2023, 1, 15))

        # 3. ISO format string
        self.assertEqual(parse_date("2023-01-15T12:30:00.000Z"), datetime.date(2023, 1, 15))

        # 4. Valid date strings
        self.assertEqual(parse_date("2023-01-15"), datetime.date(2023, 1, 15))
        self.assertEqual(parse_date("2023/01/15"), datetime.date(2023, 1, 15))
        self.assertEqual(parse_date("15-01-2023"), datetime.date(2023, 1, 15))
        self.assertEqual(parse_date("15/01/2023"), datetime.date(2023, 1, 15))

        # 5. Invalid date strings (should fallback to 1970-01-01)
        self.assertEqual(parse_date("invalid_date"), datetime.date(1970, 1, 1))
        self.assertEqual(parse_date("2023-13-45"), datetime.date(1970, 1, 1))

        # 6. Null or empty
        self.assertEqual(parse_date(None), datetime.date(1970, 1, 1))
        self.assertEqual(parse_date(""), datetime.date(1970, 1, 1))
        self.assertEqual(parse_date("   "), datetime.date(1970, 1, 1))

        # 7. Other types
        self.assertEqual(parse_date(12345), datetime.date(1970, 1, 1))

    def test_normal_case_no_history(self):
        """Test normal case with no historical claims."""
        passed, msg, ctx = guard_cross_month_duplicate(
            "worker_123", "proj_456", "2023-05-01", []
        )
        self.assertTrue(passed)
        self.assertEqual(ctx["worker_id"], "worker_123")
        self.assertEqual(ctx["project_id"], "proj_456")
        self.assertEqual(ctx["claim_date"], "2023-05-01")
        self.assertEqual(ctx["evaluated_records"], 0)
        self.assertIsNone(ctx["intercepted_by_record"])

    def test_normal_case_different_project(self):
        """Test normal case with history but for a different project."""
        history = [
            {"project_id": "proj_789", "claim_date": "2023-04-15"},
            {"project_id": "proj_000", "claim_date": "2023-03-01"}
        ]
        passed, msg, ctx = guard_cross_month_duplicate(
            "worker_123", "proj_456", "2023-05-01", history
        )
        self.assertTrue(passed)
        self.assertEqual(ctx["evaluated_records"], 2)

    def test_intercepted_case_duplicate_within_90_days(self):
        """Test interception when the same project is claimed within 90 days."""
        history = [
            {"project_id": "proj_456", "claim_date": "2023-03-01"}  # ~61 days ago
        ]
        passed, msg, ctx = guard_cross_month_duplicate(
            "worker_123", "proj_456", "2023-05-01", history
        )
        self.assertFalse(passed)
        self.assertIn("Duplicate claim intercepted", msg)
        self.assertIsNotNone(ctx["intercepted_by_record"])
        self.assertEqual(ctx["intercepted_by_record"]["project_id"], "proj_456")
        self.assertEqual(ctx["intercepted_by_record"]["claim_date"], "2023-03-01")

    def test_missing_parameter_fallback(self):
        """Test fallback behavior when parameters are missing or None."""
        passed, msg, ctx = guard_cross_month_duplicate(
            None, None, None, None
        )
        self.assertTrue(passed)
        self.assertEqual(ctx["worker_id"], "unknown_worker")
        self.assertEqual(ctx["project_id"], "unknown_project")
        self.assertEqual(ctx["claim_date"], "1970-01-01")

        # Test with empty strings/spaces
        passed, msg, ctx = guard_cross_month_duplicate(
            "   ", "", "invalid", None
        )
        self.assertTrue(passed)
        self.assertEqual(ctx["worker_id"], "unknown_worker")
        self.assertEqual(ctx["project_id"], "unknown_project")
        self.assertEqual(ctx["claim_date"], "1970-01-01")

    def test_dirty_data_self_healing(self):
        """Test self-healing when history contains dirty data (wrong types, invalid dates)."""
        history = [
            "invalid_record_type",
            {"project_id": None, "claim_date": "2023-01-01"},
            {"project_id": "  ", "claim_date": "2023-01-01"},
            {"project_id": "proj_456", "claim_date": "not_a_date"},  # Will default to 1970-01-01
            {"project_id": 456, "claim_date": 12345}  # project 456, date 1970-01-01
        ]

        # Test against claim date 2023-05-01 (far from 1970-01-01)
        passed, msg, ctx = guard_cross_month_duplicate(
            "worker_123", "proj_456", "2023-05-01", history
        )
        self.assertTrue(passed)
        # Should evaluate the last two records (proj_456 and 456)
        self.assertEqual(ctx["evaluated_records"], 2)

    def test_extreme_boundary_exactly_90_days(self):
        """Test boundary condition: exactly 90 days ago."""
        # 2023-01-01 to 2023-04-01 is 90 days (Jan 31 + Feb 28 + Mar 31)
        history = [
            {"project_id": "proj_456", "claim_date": "2023-01-01"}
        ]
        passed, msg, ctx = guard_cross_month_duplicate(
            "worker_123", "proj_456", "2023-04-01", history
        )
        self.assertFalse(passed)  # Should intercept (<= 90)
        self.assertEqual(ctx["intercepted_by_record"]["days_diff"], 90)

    def test_extreme_boundary_91_days(self):
        """Test boundary condition: exactly 91 days ago (should pass)."""
        history = [
            {"project_id": "proj_456", "claim_date": "2023-01-01"}
        ]
        passed, msg, ctx = guard_cross_month_duplicate(
            "worker_123", "proj_456", "2023-04-02", history
        )
        self.assertTrue(passed)  # Should pass (> 90)

    def test_negative_days_diff(self):
        """Test when current claim is older than historical claim (out of order dates)."""
        history = [
            {"project_id": "proj_456", "claim_date": "2023-05-01"}
        ]
        # Current claim is earlier, but diff is still within 90 days
        passed, msg, ctx = guard_cross_month_duplicate(
            "worker_123", "proj_456", "2023-04-15", history
        )
        self.assertFalse(passed)
        self.assertEqual(ctx["intercepted_by_record"]["days_diff"], 16)

if __name__ == '__main__':
    unittest.main()
