import unittest
from ultra_modules.advance_loan_deduction_guard_integration_bridge import process_advance_deductions

class TestAdvanceLoanDeductionGuard(unittest.TestCase):

    def test_normal_processing(self):
        payroll = [{"emp_id": "1001", "base_salary": 5000, "bonus": 1000}]
        advances = [{"emp_id": "1001", "amount": 2000}]
        res = process_advance_deductions(payroll, advances, min_net_salary=1000)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["net_salary"], 4000)
        self.assertEqual(res[0]["actual_deduction"], 2000)

    def test_over_deduction_prevention(self):
        payroll = [{"emp_id": "1002", "base_salary": 2000, "bonus": 500}]
        advances = [{"emp_id": "1002", "amount": 3000}]
        res = process_advance_deductions(payroll, advances, min_net_salary=500)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["net_salary"], 500)
        self.assertEqual(res[0]["actual_deduction"], 2000)

    def test_dirty_data_healing(self):
        payroll = [{"id": "1003", "salary": "3000", "allowance": "invalid"}]
        advances = [{"worker_id": "1003", "advance_amount": "1500"}]
        res = process_advance_deductions(payroll, advances)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["gross_salary"], 3000)
        self.assertEqual(res[0]["actual_deduction"], 1500)
        self.assertEqual(res[0]["net_salary"], 1500)

    def test_missing_params_default(self):
        res = process_advance_deductions(None, None)
        self.assertEqual(res, [])

        res = process_advance_deductions("invalid", "invalid")
        self.assertEqual(res, [])

    def test_extreme_boundary(self):
        payroll = [{"emp_id": "1004", "standard_wage": 0, "performance_bonus": 0}]
        advances = [{"emp_id": "1004", "value": 1000}]
        res = process_advance_deductions(payroll, advances)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["net_salary"], 0)
        self.assertEqual(res[0]["actual_deduction"], 0)

    def test_advance_without_payroll(self):
        advances = [{"emp_id": "1005", "amount": 1000}]
        res = process_advance_deductions([], advances)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["employee_id"], "1005")
        self.assertEqual(res[0]["net_salary"], 0)
        self.assertEqual(res[0]["actual_deduction"], 0)

    def test_payroll_embedded_advance(self):
        payroll = [{"emp_id": "1006", "base_salary": 4000, "weekly_advances": 1500}]
        res = process_advance_deductions(payroll, [])
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["net_salary"], 2500)
        self.assertEqual(res[0]["actual_deduction"], 1500)

    def test_non_dict_elements(self):
        payroll = ["invalid_string", {"emp_id": "1007", "base_salary": 1000}]
        advances = ["invalid_string", {"emp_id": "1007", "amount": 200}]
        res = process_advance_deductions(payroll, advances)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["employee_id"], "1007")

    def test_missing_emp_id(self):
        payroll = [{"base_salary": 1000}]
        advances = [{"amount": 200}]
        res = process_advance_deductions(payroll, advances)
        self.assertEqual(len(res), 1)
        self.assertTrue(res[0]["employee_id"].startswith("unknown_"))

if __name__ == '__main__':
    unittest.main()
