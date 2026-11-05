import unittest
import decimal
import sys
import os

# Add root directory to sys.path to allow importing ultra_modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from ultra_modules.advance_loan_deduction_guard_audit_trace import process_advance_deduction

class TestAdvanceLoanDeductionGuardAuditTrace(unittest.TestCase):

    def test_normal_case(self):
        """Test normal calculation where total advances are below the max deduction."""
        base_salary = 1000
        advances = [
            {"id": "adv_1", "amount": 100},
            {"id": "adv_2", "amount": "200"}
        ]
        result = process_advance_deduction(base_salary, advances, 0.2)
        self.assertEqual(result["net_salary"], decimal.Decimal("700.00"))
        self.assertEqual(result["total_deducted"], decimal.Decimal("300.00"))
        self.assertTrue(any("PROCESS: Accepted advance 'adv_1' with amount 100" in log for log in result["audit_log"]))

    def test_dirty_data_self_healing(self):
        """Test how dirty data is automatically healed (invalid values converted to 0, negative values fixed)."""
        base_salary = "invalid_salary"
        advances = [
            {"id": "adv_1", "amount": -50},  # Negative amounts are set to 0.00
            {"id": "adv_2", "amount": "invalid_amount"}, # Invalid strings set to 0.00
            "not a dict" # Invalid item type skipped
        ]
        result = process_advance_deduction(base_salary, advances)
        self.assertEqual(result["net_salary"], decimal.Decimal("0.00"))
        self.assertEqual(result["total_deducted"], decimal.Decimal("0.00"))
        self.assertTrue(any("CLEANING: Invalid base_salary" in log for log in result["audit_log"]))
        self.assertTrue(any("CLEANING: Negative amount" in log for log in result["audit_log"]))
        self.assertTrue(any("CLEANING: Invalid amount" in log for log in result["audit_log"]))

    def test_missing_params(self):
        """Test zero-config behavior with missing parameters using defaults."""
        base_salary = 500
        result = process_advance_deduction(base_salary) # no advances or min_ratio provided
        self.assertEqual(result["net_salary"], decimal.Decimal("500.00"))
        self.assertEqual(result["total_deducted"], decimal.Decimal("0.00"))
        self.assertTrue(any("FALLBACK: advances parameter missing or None" in log for log in result["audit_log"]))

    def test_extreme_over_deduction(self):
        """Test that the guard correctly caps deductions so the worker takes home at least the minimum ratio."""
        base_salary = 1000
        advances = [
            {"id": "adv_1", "amount": 800},
            {"id": "adv_2", "amount": 500}
        ]
        # min_take_home_ratio is 0.2 (20%) default, so max deduction is 800 (1000 - 200).
        # Requested is 1300.
        result = process_advance_deduction(base_salary, advances)
        self.assertEqual(result["net_salary"], decimal.Decimal("200.00")) # 20% of 1000
        self.assertEqual(result["total_deducted"], decimal.Decimal("800.00")) # 1000 - 200
        self.assertTrue(any("GUARD: Over-deduction prevented" in log for log in result["audit_log"]))

    def test_duplicate_advances(self):
        """Test deduplication logic using the advance ID."""
        base_salary = 1000
        advances = [
            {"id": "adv_1", "amount": 100},
            {"id": "adv_1", "amount": 200}, # This is a duplicate ID, so should be ignored
            {"id": "adv_2", "amount": 150},
            {"amount": 50}, # No ID, will generate random ID
            {"amount": 50}  # No ID, will generate another random ID
        ]
        result = process_advance_deduction(base_salary, advances)

        # Total deduction should be 100 + 150 + 50 + 50 = 350
        # Net salary should be 1000 - 350 = 650
        self.assertEqual(result["total_deducted"], decimal.Decimal("350.00"))
        self.assertEqual(result["net_salary"], decimal.Decimal("650.00"))
        self.assertTrue(any("DEDUPLICATION: Skipped duplicate advance ID 'adv_1'" in log for log in result["audit_log"]))

if __name__ == '__main__':
    unittest.main()
