import unittest
from unittest.mock import patch
import time

from ultra_modules.advance_loan_deduction_guard_self_healing_guard import AdvanceLoanDeductionGuard

class TestAdvanceLoanDeductionGuard(unittest.TestCase):
    def setUp(self):
        self.guard = AdvanceLoanDeductionGuard()

    def test_normal_deduction(self):
        """Test Case 1: Normal deduction where requested is less than salary."""
        result = self.guard.process_deduction("worker_01", 5000.0, 1000.0)
        self.assertEqual(result['worker_id'], "worker_01")
        self.assertEqual(result['actual_deduction'], 1000.0)
        self.assertEqual(result['remaining_salary'], 4000.0)
        self.assertIn('snapshot_id', result)

    def test_over_deduction_protection(self):
        """Test Case 2: Deduction requested exceeds the monthly salary."""
        # The worker requests 6000 but only has 5000 salary. Deduction should cap at 5000.
        result = self.guard.process_deduction("worker_02", 5000.0, 6000.0)
        self.assertEqual(result['actual_deduction'], 5000.0)
        self.assertEqual(result['remaining_salary'], 0.0)

        # Boundary condition: exact match
        result_exact = self.guard.process_deduction("worker_03", 5000.0, 5000.0)
        self.assertEqual(result_exact['actual_deduction'], 5000.0)
        self.assertEqual(result_exact['remaining_salary'], 0.0)

    def test_dirty_data_and_missing_params(self):
        """Test Case 3: Self-healing for dirty string data, negative values, and missing parameters."""
        # Negative value self-healing (should become 0.0)
        result1 = self.guard.process_deduction("worker_04", -100.0, -50.0)
        self.assertEqual(result1['actual_deduction'], 0.0)
        self.assertEqual(result1['remaining_salary'], 0.0)

        # String parsing and symbol cleaning
        result2 = self.guard.process_deduction("worker_05", "$5,000.50", "￥1,000.25")
        self.assertEqual(result2['actual_deduction'], 1000.25)
        self.assertEqual(result2['remaining_salary'], 5000.50 - 1000.25)

        # Missing parameters fallback
        result3 = self.guard.process_deduction(None, None, None)
        self.assertTrue(result3['worker_id'].startswith("unknown_"))
        self.assertEqual(result3['actual_deduction'], 0.0)
        self.assertEqual(result3['remaining_salary'], 0.0)

    def test_successful_undo(self):
        """Test Case 4: Undo the deduction within the 5 seconds window."""
        result = self.guard.process_deduction("worker_06", 5000.0, 1000.0)
        self.assertEqual(result['remaining_salary'], 4000.0)

        undo_result = self.guard.undo("worker_06")
        self.assertTrue(undo_result['success'])
        self.assertEqual(undo_result['message'], 'Deduction successfully undone.')
        self.assertEqual(undo_result['recovered_salary'], 5000.0)

        # Double undo should fail
        undo_result2 = self.guard.undo("worker_06")
        self.assertFalse(undo_result2['success'])
        self.assertEqual(undo_result2['message'], 'Already undone.')

    @patch('time.time')
    def test_undo_window_expired(self, mock_time):
        """Test Case 5: Undo fails when the 5 seconds window has expired."""
        # Initial time
        base_time = 1000000.0
        mock_time.return_value = base_time

        result = self.guard.process_deduction("worker_07", 5000.0, 1000.0)
        self.assertEqual(result['remaining_salary'], 4000.0)

        # Move time forward by 6 seconds
        mock_time.return_value = base_time + 6.0

        undo_result = self.guard.undo("worker_07")
        self.assertFalse(undo_result['success'])
        self.assertEqual(undo_result['message'], 'Undo window expired (over 5 seconds).')
        self.assertEqual(undo_result['recovered_salary'], 4000.0)

if __name__ == '__main__':
    unittest.main()
