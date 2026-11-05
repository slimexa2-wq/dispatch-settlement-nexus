import unittest
import json
from ultra_modules.advance_loan_deduction_guard_cli_one_click import (
    clean_amount,
    calculate_deductions,
    run_guard_cli
)

class TestAdvanceLoanDeductionGuard(unittest.TestCase):

    def test_normal_processing(self):
        # Case 1: Normal processing where deduction is less than gross salary
        data = [{'employee_id': 'EMP001', 'name': 'Alice', 'gross_salary': 5000, 'advance_loan': 1000}]
        results = calculate_deductions(data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['actual_deduction'], 1000)
        self.assertEqual(results[0]['net_salary'], 4000)
        self.assertEqual(results[0]['unpaid_loan'], 0)

    def test_dirty_data_self_healing(self):
        # Case 2: Dirty data self-healing (strings with commas, None, negative strings)
        data = [
            {'employee_id': 'EMP002', 'name': 'Bob', 'gross_salary': '4,500.50', 'advance_loan': '500.25'},
            {'employee_id': 'EMP003', 'name': 'Charlie', 'gross_salary': None, 'advance_loan': 'bad_string'}
        ]
        results = calculate_deductions(data)

        self.assertEqual(results[0]['gross_salary'], 4500.50)
        self.assertEqual(results[0]['actual_deduction'], 500.25)
        self.assertEqual(results[0]['net_salary'], 4000.25)

        self.assertEqual(results[1]['gross_salary'], 0.0)
        self.assertEqual(results[1]['actual_deduction'], 0.0)
        self.assertEqual(results[1]['net_salary'], 0.0)

    def test_missing_parameters_fallback(self):
        # Case 3: Missing parameters fallback
        data = [{'employee_id': 'EMP004', 'name': 'Diana'}]
        results = calculate_deductions(data)

        self.assertEqual(results[0]['gross_salary'], 0.0)
        self.assertEqual(results[0]['advance_loan_requested'], 0.0)
        self.assertEqual(results[0]['actual_deduction'], 0.0)
        self.assertEqual(results[0]['net_salary'], 0.0)
        self.assertEqual(results[0]['unpaid_loan'], 0.0)

    def test_extreme_boundaries(self):
        # Case 4: Extreme boundaries (loan exceeds salary, negative inputs)
        data = [
            {'employee_id': 'EMP005', 'name': 'Eve', 'gross_salary': 3000, 'advance_loan': 5000},
            {'employee_id': 'EMP006', 'name': 'Frank', 'gross_salary': -1000, 'advance_loan': -500}
        ]
        results = calculate_deductions(data)

        # Loan exceeds salary
        self.assertEqual(results[0]['actual_deduction'], 3000)
        self.assertEqual(results[0]['net_salary'], 0)
        self.assertEqual(results[0]['unpaid_loan'], 2000)

        # Negative inputs (should be clamped to 0)
        self.assertEqual(results[1]['gross_salary'], 0.0)
        self.assertEqual(results[1]['advance_loan_requested'], 0.0)
        self.assertEqual(results[1]['actual_deduction'], 0.0)
        self.assertEqual(results[1]['net_salary'], 0.0)
        self.assertEqual(results[1]['unpaid_loan'], 0.0)

    def test_zero_parameter_cli(self):
        # Case 5: Zero-parameter CLI run
        result_json = run_guard_cli()
        results = json.loads(result_json)
        self.assertIsInstance(results, list)
        self.assertTrue(len(results) > 0)

        # Verify first default data processing
        self.assertEqual(results[0]['employee_id'], 'EMP001')
        self.assertEqual(results[0]['gross_salary'], 5000)

        # Verify edge case in default data
        self.assertEqual(results[1]['actual_deduction'], 4000)
        self.assertEqual(results[1]['net_salary'], 0)

if __name__ == '__main__':
    unittest.main()
