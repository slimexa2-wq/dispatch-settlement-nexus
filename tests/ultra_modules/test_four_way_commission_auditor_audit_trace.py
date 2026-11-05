import unittest
from ultra_modules.four_way_commission_auditor_audit_trace import FourWayCommissionAuditor

class TestFourWayCommissionAuditor(unittest.TestCase):
    def setUp(self):
        self.auditor = FourWayCommissionAuditor()
        self.default_policy = {
            "base_rate": 0.1,
            "attendance_bonus_threshold": 20,
            "attendance_bonus": 500.0,
            "max_commission_cap": 5000.0
        }

    def test_normal_calculation(self):
        records = [{
            "id": "rec-1",
            "salary": 10000,
            "attendance_days": 22,
            "last_month_commission": 0,
            "reported_commission": 1500.0
        }]

        result = self.auditor.audit(records, self.default_policy)

        self.assertEqual(result["summary"]["mismatch_count"], 0)
        self.assertEqual(result["summary"]["total_commission"], 1500.0)
        self.assertEqual(len(result["differences"]), 0)

    def test_dirty_data_self_healing(self):
        records = [{
            "id": "rec-2",
            "salary": "-5000",  # Negative string
            "attendance_days": "invalid",  # Invalid int
            "last_month_commission": -100, # Negative float
            "reported_commission": "400.0"
        }]

        # Policy is missing base_rate, should fallback to 0.05
        policy = {
            "attendance_bonus_threshold": 20,
            "attendance_bonus": 500.0,
            "max_commission_cap": 5000.0
        }

        result = self.auditor.audit(records, policy)

        # salary becomes 5000 (absolute)
        # base rate falls back to 0.05
        # base = 5000 * 0.05 = 250
        # attendance falls back to 0
        # last_month_commission absolute to 100, deducted
        # calc = 250 - 100 = 150
        # diff = 150 - 400 = -250

        self.assertEqual(result["clean_records"][0]["calculated_commission"], 150.0)
        self.assertEqual(result["summary"]["mismatch_count"], 1)
        self.assertEqual(result["differences"][0]["diff"], -250.0)

    def test_missing_parameters_fallback(self):
        records = [{}] # Empty dict, completely missing parameters

        result = self.auditor.audit(records, {}) # Empty policy

        # Should generate an ID
        self.assertIsNotNone(result["clean_records"][0]["id"])
        # Defaults to 0 commission
        self.assertEqual(result["clean_records"][0]["calculated_commission"], 0.0)

    def test_extreme_boundary_and_capping(self):
        records = [{
            "id": "rec-3",
            "salary": 1000000, # High salary
            "attendance_days": 40, # Exceeds 31 max
            "last_month_commission": 0,
            "reported_commission": 0
        }]

        result = self.auditor.audit(records, self.default_policy)

        # Attendance capped at 31
        self.assertEqual(result["clean_records"][0]["attendance_days"], 31)
        # Commission calculation: 1000000 * 0.1 + 500 = 100500 > 5000
        # Capped at 5000
        self.assertEqual(result["clean_records"][0]["calculated_commission"], 5000.0)

    def test_deduplication(self):
        records = [
            {"id": "rec-dup", "salary": 1000},
            {"id": "rec-dup", "salary": 2000}
        ]

        result = self.auditor.audit(records, self.default_policy)

        # Should only process the first one
        self.assertEqual(len(result["clean_records"]), 1)
        self.assertEqual(result["clean_records"][0]["salary"], 1000)

if __name__ == "__main__":
    unittest.main()
