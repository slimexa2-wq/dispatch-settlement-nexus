import unittest
import json
from ultra_modules.CrossMonthDuplicateGuard_cli_one_click import guard_claim, OneClickCLIAdapter

class TestCrossMonthDuplicateGuardCLIOneClick(unittest.TestCase):
    def setUp(self):
        self.adapter = OneClickCLIAdapter()

    def test_normal_approved_condition(self):
        """1. Normal processing: should approve if claim is outside of 90 days"""
        history = [
            {"project_id": "P001", "claim_date": "2023-01-01"}
        ]
        is_approved, msg, ctx = guard_claim("W001", "P001", "2023-05-01", history)

        self.assertTrue(is_approved)
        self.assertIn("Approved", msg)
        self.assertEqual(ctx["evaluated_records"], 1)
        self.assertIsNone(ctx["intercepted_by"])

    def test_dirty_data_self_healing(self):
        """2. Dirty data self-healing: messy IDs and dates, non-dict history"""
        history = [
            "invalid_record_string",
            {"project_id": " P002 ", "claim_date": "2023-05-15T12:00:00Z"},
            {"invalid_key": "val"}
        ]
        # Same project P002, same date conceptually
        is_approved, msg, ctx = guard_claim("  W002  ", " P002 ", "2023-05-15", history)

        self.assertFalse(is_approved)
        self.assertIn("intercepted", msg.lower())
        self.assertEqual(ctx["worker_id"], "W002")
        self.assertEqual(ctx["project_id"], "P002")
        self.assertEqual(ctx["claim_date"], "2023-05-15")
        # should only evaluate the valid dict with project_id
        self.assertEqual(ctx["evaluated_records"], 1)

    def test_missing_parameter_default_fallback(self):
        """3. Missing parameter default fallback"""
        is_approved, msg, ctx = guard_claim(None, "", None, None)

        self.assertTrue(is_approved)
        self.assertEqual(ctx["worker_id"], "unknown_worker")
        self.assertEqual(ctx["project_id"], "unknown_project")
        self.assertEqual(ctx["claim_date"], "1970-01-01")
        self.assertEqual(ctx["evaluated_records"], 0)

    def test_extreme_boundary_conditions(self):
        """4. Extreme boundary conditions: Exactly 90 days difference"""
        history = [
            {"project_id": "P004", "claim_date": "2023-01-01"}
        ]
        # Difference between 2023-01-01 and 2023-04-01 is 90 days
        is_approved_90, msg_90, _ = guard_claim("W004", "P004", "2023-04-01", history)
        self.assertFalse(is_approved_90)
        self.assertIn("90 days", msg_90)

        # Difference between 2023-01-01 and 2023-04-02 is 91 days
        is_approved_91, msg_91, _ = guard_claim("W004", "P004", "2023-04-02", history)
        self.assertTrue(is_approved_91)

        # Out of order dates (future date in history)
        history_future = [
            {"project_id": "P004", "claim_date": "2023-04-01"}
        ]
        is_approved_reverse, _, _ = guard_claim("W004", "P004", "2023-01-01", history_future)
        self.assertFalse(is_approved_reverse)

    def test_adapter_zero_param_and_dual_mode(self):
        """5. Adapter output formatting for zero-parameter default run"""
        # Zero param process
        result = self.adapter.process()
        self.assertEqual(result["status"], "intercepted")
        self.assertEqual(result["context"]["worker_id"], "W999")

        # JSON test
        json_output = self.adapter.to_json(result)
        parsed_json = json.loads(json_output)
        self.assertEqual(parsed_json["status"], "intercepted")
        self.assertEqual(parsed_json["context"]["project_id"], "P001")

        # CSV/Excel test
        csv_output = self.adapter.to_csv(result)
        lines = csv_output.strip().split("\r\n")
        self.assertEqual(len(lines), 2)
        # Header check
        self.assertTrue(lines[0].startswith("Status,Message"))
        # Values check
        self.assertIn("intercepted", lines[1])
        self.assertIn("W999", lines[1])
        self.assertIn("P001", lines[1])

if __name__ == '__main__':
    unittest.main()
