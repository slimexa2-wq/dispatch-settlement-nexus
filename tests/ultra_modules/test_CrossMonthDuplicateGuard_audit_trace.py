import unittest
import datetime
from ultra_modules.CrossMonthDuplicateGuard_audit_trace import CrossMonthDuplicateGuardAuditTrace

class TestCrossMonthDuplicateGuardAuditTrace(unittest.TestCase):

    def test_normal_case_allow(self):
        # Different worker/project, outside window
        current = {
            "worker_id": "W123",
            "project_id": "P456",
            "claim_date": "2023-10-01"
        }
        historical = [
            {
                "worker_id": "W123",
                "project_id": "P456",
                "claim_date": "2023-01-01" # > 90 days
            },
            {
                "worker_id": "W999", # diff worker
                "project_id": "P456",
                "claim_date": "2023-09-15"
            }
        ]
        result = CrossMonthDuplicateGuardAuditTrace.evaluate(current, historical)
        self.assertFalse(result["frontend_result"]["is_duplicate"])
        self.assertTrue(result["frontend_result"]["allow_claim"])
        self.assertEqual(result["frontend_result"]["message"], "Claim allowed.")

    def test_normal_case_duplicate(self):
        # Same worker, same project, exactly 90 days
        current = {
            "worker_id": "W123",
            "project_id": "P456",
            "claim_date": "2023-10-01"
        }
        historical = [
            {
                "worker_id": "W123",
                "project_id": "P456",
                "claim_date": "2023-07-03" # exactly 90 days difference
            }
        ]
        result = CrossMonthDuplicateGuardAuditTrace.evaluate(current, historical)
        self.assertTrue(result["frontend_result"]["is_duplicate"])
        self.assertFalse(result["frontend_result"]["allow_claim"])
        self.assertIn("Difference: 90 days", result["backend_audit_trace"]["differences_highlighted"][3])

    def test_boundary_91_days(self):
        # 91 days should be allowed
        current = {
            "worker_id": "W123",
            "project_id": "P456",
            "claim_date": "2023-10-01"
        }
        historical = [
            {
                "worker_id": "W123",
                "project_id": "P456",
                "claim_date": "2023-07-02" # 91 days diff
            }
        ]
        result = CrossMonthDuplicateGuardAuditTrace.evaluate(current, historical)
        self.assertFalse(result["frontend_result"]["is_duplicate"])
        self.assertTrue(result["frontend_result"]["allow_claim"])

    def test_dirty_data_self_healing(self):
        # Invalid inputs like None, missing keys, non-dict
        current = None # Should fallback to {} and then unknown_worker/unknown_project
        historical = None # Should fallback to []

        result = CrossMonthDuplicateGuardAuditTrace.evaluate(current, historical)

        # Verify self-healing in audit trace
        audit_steps = [step.get("action") for step in result["backend_audit_trace"]["steps"] if "action" in step]
        self.assertIn("self_heal", audit_steps)
        self.assertFalse(result["frontend_result"]["is_duplicate"])
        self.assertTrue(result["frontend_result"]["allow_claim"])

        # Test malformed historical
        # Missing claim_date for historical currently defaults to datetime.date.min
        # so difference is > 90 days. We'll set them both to the same date manually to trigger a duplicate.
        result2 = CrossMonthDuplicateGuardAuditTrace.evaluate(
            {"worker_id": "  w123 ", "project_id": "p456", "claim_date": "2023-01-01"},
            ["not a dict", {"worker_id": "W123", "project_id": "P456", "claim_date": "2023-01-01"}]
        )
        self.assertTrue(result2["frontend_result"]["is_duplicate"])

    def test_date_parsing_formats(self):
        # Test various date formats
        current = {
            "worker_id": "w1",
            "project_id": "p1",
            "claim_date": datetime.date(2023, 5, 15)
        }
        historical = [
            {
                "worker_id": "W1",
                "project_id": "P1",
                "claim_date": "2023-04-10T12:00:00Z"
            }
        ]
        result = CrossMonthDuplicateGuardAuditTrace.evaluate(current, historical)
        self.assertTrue(result["frontend_result"]["is_duplicate"])
        self.assertIn("Difference: 35 days", result["backend_audit_trace"]["differences_highlighted"][3])

if __name__ == '__main__':
    unittest.main()
