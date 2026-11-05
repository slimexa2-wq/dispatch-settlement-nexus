import unittest
from ultra_modules.ResignedWorkerPayHold_integration_bridge import ResignedWorkerPayHoldIntegrationBridge, process

class TestResignedWorkerPayHoldIntegrationBridge(unittest.TestCase):

    def test_normal_case_old_schema(self):
        """Test Case 1: Normal case with old schema."""
        record = {
            'worker_id': 'EMP001',
            'base_salary': 4350.0,
            'absent_days': 2.0,
            'resignation_type': 'normal',
            'pending_pay': 2000.0
        }
        result = process(record)[0]

        self.assertEqual(result['worker_id'], 'EMP001')
        self.assertEqual(result['original_pending_pay'], 2000.0)

        # Daily rate = 4350 / 21.75 = 200
        # Absent deduction = 2 * 200 = 400
        # Quick quit penalty = 0 (since it's 'normal')
        self.assertEqual(result['deduction_details']['absent_deduction'], 400.0)
        self.assertEqual(result['deduction_details']['quick_quit_penalty'], 0.0)
        self.assertEqual(result['total_deduction'], 400.0)
        self.assertEqual(result['final_net_pay'], 1600.0)

        # Verify audit log exists
        self.assertIn('_audit_log', result)
        self.assertTrue(len(result['_audit_log']) > 0)

    def test_new_schema_forward_compatibility(self):
        """Test Case 2: New schema mapping and quick quit logic."""
        record = {
            'id': 'EMP002',
            'monthly_base': 4350.0,
            'absenteeism': 1.0,
            'leave_reason': 'quick_quit',
            'unpaid_balance': 3000.0,
            'daily_rate': 200.0
        }
        result = process([record])[0]

        self.assertEqual(result['worker_id'], 'EMP002')
        self.assertEqual(result['original_pending_pay'], 3000.0)

        # Absent deduction = 1 * 200 = 200
        # Quick quit penalty = min(3 * 200, 4350 * 0.20) = min(600, 870) = 600
        self.assertEqual(result['deduction_details']['absent_deduction'], 200.0)
        self.assertEqual(result['deduction_details']['quick_quit_penalty'], 600.0)
        self.assertEqual(result['total_deduction'], 800.0)
        self.assertEqual(result['final_net_pay'], 2200.0)

    def test_dirty_data_self_healing(self):
        """Test Case 3: Dirty data (strings where numbers should be, unexpected formats)."""
        record = {
            'id': ' EMP003 ',
            'monthly_base': '4,350.00', # Commas in number
            'absenteeism': ' 2 ',       # Spaces
            'leave_reason': 'RUNAWAY',  # Different casing
            'unpaid_balance': 'invalid',# Invalid number should default to 0
            'daily_rate': None          # None should trigger default calculation
        }
        result = process(record)[0]

        self.assertEqual(result['worker_id'], 'EMP003') # Trimmed

        # Invalid unpaid_balance -> 0.0
        self.assertEqual(result['original_pending_pay'], 0.0)

        # '4,350.00' -> 4350.0
        # ' 2 ' -> 2.0
        # Daily rate = 4350 / 21.75 = 200
        # Absent deduction = 2 * 200 = 400
        # RUNAWAY -> quick quit penalty = min(600, 870) = 600
        self.assertEqual(result['deduction_details']['absent_deduction'], 400.0)
        self.assertEqual(result['deduction_details']['quick_quit_penalty'], 600.0)
        self.assertEqual(result['total_deduction'], 1000.0)

        # Net pay cannot be negative
        self.assertEqual(result['final_net_pay'], 0.0)

    def test_missing_parameter_defaults(self):
        """Test Case 4: Completely missing parameters default gracefully."""
        record = {}
        result = process(record)[0]

        self.assertEqual(result['worker_id'], 'UNKNOWN')
        self.assertEqual(result['original_pending_pay'], 0.0)
        self.assertEqual(result['deduction_details']['absent_deduction'], 0.0)
        self.assertEqual(result['deduction_details']['quick_quit_penalty'], 0.0)
        self.assertEqual(result['total_deduction'], 0.0)
        self.assertEqual(result['final_net_pay'], 0.0)

    def test_extreme_boundary_cases(self):
        """Test Case 5: Extreme boundaries (huge numbers, zero values)."""
        record = {
            'worker_id': 'EMP005',
            'base_salary': 1000000.0, # Huge salary
            'absent_days': 0.0,       # No absences
            'resignation_type': 'quick',
            'pending_pay': 100.0      # Tiny pending pay compared to deduction
        }
        result = process(record)[0]

        self.assertEqual(result['original_pending_pay'], 100.0)

        # Daily rate = 1000000 / 21.75 = 45977.01
        # Absent = 0
        # Quick quit = min(3 * 45977.01, 1000000 * 0.20) = min(137931.03, 200000.0) = 137931.03
        self.assertEqual(result['deduction_details']['absent_deduction'], 0.0)
        self.assertAlmostEqual(result['deduction_details']['quick_quit_penalty'], 137931.03, places=2)
        self.assertAlmostEqual(result['total_deduction'], 137931.03, places=2)

        # Deduction far exceeds pending pay, net should be 0
        self.assertEqual(result['final_net_pay'], 0.0)

    def test_batch_invalid_input(self):
        """Test Case 6: Edge case where non-list/dict is passed to batch."""
        result = process("invalid input")
        self.assertEqual(result, [])

        result_with_invalid_items = process([{"id": "1"}, "invalid", {"id": "2"}])
        self.assertEqual(len(result_with_invalid_items), 2)
        self.assertEqual(result_with_invalid_items[0]['worker_id'], '1')
        self.assertEqual(result_with_invalid_items[1]['worker_id'], '2')

if __name__ == '__main__':
    unittest.main()
