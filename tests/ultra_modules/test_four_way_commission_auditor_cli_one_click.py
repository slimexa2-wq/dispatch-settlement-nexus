import unittest
import json
from ultra_modules.four_way_commission_auditor_cli_one_click import FourWayCommissionAuditor, run_auditor_one_click

class TestFourWayCommissionAuditor(unittest.TestCase):

    def test_normal_execution(self):
        """Test case 1: Normal execution with valid parameters"""
        data = {
            "salary": 10000,
            "attendance": 1.0,
            "policy_multiplier": 1.2,
            "last_month_base": 2000
        }
        auditor = FourWayCommissionAuditor(data)
        result = auditor.audit()
        self.assertTrue(result["all_passed"])
        self.assertEqual(result["calculated_commission"], (10000 + 2000) * 1.0 * 1.2)

    def test_missing_parameter_fallback(self):
        """Test case 2: Zero parameters fallback (Default one-click execution)"""
        result_json = run_auditor_one_click()
        result = json.loads(result_json)
        self.assertTrue(result["all_passed"])
        self.assertEqual(result["calculated_commission"], 0.0)

    def test_dirty_data_self_healing(self):
        """Test case 3: Dirty data self-healing (nulls, empty strings, nan, invalid types)"""
        data = {
            "salary": "null",
            "attendance": "",
            "policy_multiplier": "NaN",
            "last_month_base": "invalid_string"
        }
        auditor = FourWayCommissionAuditor(data)
        result = auditor.audit()
        self.assertTrue(result["all_passed"])
        # salary=0, attendance=1.0 (default), policy_multiplier=1.0 (default), last_month_base=0.0
        self.assertEqual(result["calculated_commission"], (0.0 + 0.0) * 1.0 * 1.0)

    def test_extreme_boundary_conditions(self):
        """Test case 4: Extreme boundaries (negative values, enormous values)"""
        data = {
            "salary": -5000,          # Negative salary
            "attendance": -0.5,       # Negative attendance
            "policy_multiplier": -1,  # Negative policy multiplier
            "last_month_base": -1000  # Negative base
        }
        auditor = FourWayCommissionAuditor(data)
        result = auditor.audit()
        self.assertFalse(result["all_passed"]) # Some rules will fail (e.g. non-negative checks)
        # However, calculation uses max(0) and handles gracefully
        self.assertEqual(result["calculated_commission"], 0.0)

        # Test large value
        data_large = {
            "salary": 2e9,  # Triggers rule 7 fail
            "attendance": 2.0, # Triggers rule 2 fail
            "policy_multiplier": 1,
            "last_month_base": 0
        }
        auditor_large = FourWayCommissionAuditor(data_large)
        result_large = auditor_large.audit()
        self.assertFalse(result_large["all_passed"])
        # (2e9 + 0) * min(2.0, 1.0) * 1 = 2e9
        self.assertEqual(result_large["calculated_commission"], 2e9)

    def test_type_error_handling(self):
        """Test case 5: Invalid types like dicts or lists"""
        data = {
            "salary": {"amount": 1000},
            "attendance": [1.0],
            "policy_multiplier": None,
            "last_month_base": None
        }
        auditor = FourWayCommissionAuditor(data)
        result = auditor.audit()
        self.assertFalse(result["all_passed"]) # Because rule 9 strict typing should fail
        # Invalid dict/list turn to 0 by exception caught
        # salary=0, attendance=1.0 (default), policy_multiplier=1.0 (default), last_month_base=0.0
        self.assertEqual(result["calculated_commission"], 0.0)

if __name__ == '__main__':
    unittest.main()
