import unittest
import math
from ultra_modules.advance_loan_deduction_guard_export_formatter import AdvanceLoanDeductionGuard

class TestAdvanceLoanDeductionGuard(unittest.TestCase):
    def setUp(self):
        self.guard = AdvanceLoanDeductionGuard()

    def test_normal_behavior_full_deduction(self):
        """Test case 1: Normal behavior where gross pay fully covers advances."""
        data = {
            "worker_id": "W001",
            "gross_pay": 5000.0,
            "advance_loans": 1000.0,
            "minimum_take_home": 500.0
        }
        result = self.guard.process_payroll_deduction(data)
        self.assertEqual(result["comments"], 0)
        self.assertEqual(result["actual_deduction"], 1000.0)
        self.assertEqual(result["remaining_loan"], 0.0)
        self.assertEqual(result["net_pay"], 4000.0)

        # Verify no NaN/None
        for val in ["gross_pay", "requested_deduction", "actual_deduction", "remaining_loan", "net_pay"]:
            self.assertIsNotNone(result[val])
            self.assertFalse(math.isnan(result[val]))

    def test_over_deduction_guard_limits(self):
        """Test case 2: Over-deduction guard limits deduction to ensure minimum take home."""
        data = {
            "worker_id": "W002",
            "gross_pay": 3000.0,
            "advance_loans": 2800.0,
            "minimum_take_home": 500.0
        }
        result = self.guard.process_payroll_deduction(data)
        self.assertEqual(result["comments"], 0)
        # Max deductible is 3000 - 500 = 2500
        self.assertEqual(result["actual_deduction"], 2500.0)
        # Remaining loan is 2800 - 2500 = 300
        self.assertEqual(result["remaining_loan"], 300.0)
        self.assertEqual(result["net_pay"], 500.0)

        expected_report = (
            "【工资抵扣简报】员工: W002 | 应发: 3000.00 | 借支: 2800.00\n"
            "【抵扣保护执行】本月实扣: 2500.00 | 顺延欠款: 300.00\n"
            "【最终实发工资】一键实发金额: 500.00 (已防超扣)"
        )
        self.assertEqual(result["report_text"], expected_report)

    def test_dirty_data_self_healing(self):
        """Test case 3: Dirty data self-healing, such as currencies, random strings, NaNs."""
        data = {
            "worker_id": None,
            "gross_pay": "¥ 4,500.50 ",
            "advance_loans": float('nan'),
            "minimum_take_home": "invalid_num"
        }
        result = self.guard.process_payroll_deduction(data)
        self.assertEqual(result["comments"], 0)
        self.assertEqual(result["worker_id"], "Unknown_Worker")
        self.assertEqual(result["gross_pay"], 4500.50)
        self.assertEqual(result["requested_deduction"], 0.0)
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["remaining_loan"], 0.0)
        self.assertEqual(result["net_pay"], 4500.50)

    def test_missing_parameter_fallbacks(self):
        """Test case 4: Missing parameters are handled properly via defaults."""
        data = {} # Empty dict
        result = self.guard.process_payroll_deduction(data)
        self.assertEqual(result["comments"], 0)
        self.assertEqual(result["gross_pay"], 0.0)
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["net_pay"], 0.0)

        data_none = None # None payload
        result_none = self.guard.process_payroll_deduction(data_none)
        self.assertEqual(result_none["comments"], 0)
        self.assertEqual(result_none["gross_pay"], 0.0)

    def test_extreme_boundaries(self):
        """Test case 5: Extreme boundaries such as negative values or huge amounts."""
        data = {
            "worker_id": "W005",
            "gross_pay": -1000.0, # Negative gross
            "advance_loans": 9999999.0, # Huge loan
            "minimum_take_home": -500.0 # Negative min take home
        }
        result = self.guard.process_payroll_deduction(data)
        self.assertEqual(result["comments"], 0)
        # Max deductible is max(0, -1000 - (-500)) = max(0, -500) = 0
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["remaining_loan"], 9999999.0)
        # Net pay is max(0, gross - actual) = max(0, -1000 - 0) = 0
        self.assertEqual(result["net_pay"], 0.0)

if __name__ == '__main__':
    unittest.main()
