import unittest
from decimal import Decimal
from ultra_modules.tiered_rebate_calculator_audit_trace import calculate_rebate, compare_rebate_calculations

class TestTieredRebateCalculatorAuditTrace(unittest.TestCase):

    def test_normal_calculation(self):
        """Test normal calculation matching exactly a tier and with some deductions."""
        net, trace = calculate_rebate(
            days_worked=35,
            absent_days=2,
            tiers={7: '100', 15: '250', 30: '600', 45: '1000'},
            absent_deduction_per_day='50'
        )
        # Base rebate should be 600 (tier 30). Deduction is 2 * 50 = 100.
        # Net should be 500.
        self.assertEqual(net, Decimal('500.00'))

        # Verify trace contains expected steps
        steps = [t['step'] for t in trace]
        self.assertIn("base_rebate_calculation", steps)
        self.assertIn("deduction_calculation", steps)
        self.assertIn("final_result", steps)

    def test_dirty_data_self_healing(self):
        """Test dirty inputs: strings with commas, negative inputs, invalid tiers."""
        net, trace = calculate_rebate(
            days_worked=" 16,5 ", # Should parse to 16
            absent_days="-2",    # Negative healed to 0
            tiers={"invalid": "100", "-1": "50", 15: "200.5"},
            absent_deduction_per_day="-10,0" # Negative healed to positive 10
        )

        # days_worked = 16 -> matches tier 15 -> base rebate = 200.5
        # absent_days healed to 0. Deduction = 0 * 10 = 0.
        # Net = 200.5
        self.assertEqual(net, Decimal('200.5'))

        # Verify healing in trace
        steps = [t['step'] for t in trace]
        self.assertIn("clean_absent_days", steps)
        self.assertIn("clean_deduction", steps)
        self.assertIn("tiers_clean", steps)

    def test_missing_parameters_fallback(self):
        """Test missing parameter default fallbacks."""
        # Only providing days_worked
        net, trace = calculate_rebate(days_worked=8)

        # Fallback tiers: {7: '100.00', ...}
        # base rebate = 100
        # absent_days = 0, absent_deduction = 0
        # Net = 100
        self.assertEqual(net, Decimal('100.00'))

        steps = [t['step'] for t in trace]
        self.assertIn("tiers_init", steps)

    def test_extreme_edge_cases(self):
        """Test extreme deduction causing negative rebate, and 0 days worked."""
        # High deduction leading to negative net rebate -> should clamp to 0
        net1, trace1 = calculate_rebate(
            days_worked=7,
            absent_days=10,
            absent_deduction_per_day='50'
        )
        # Base rebate = 100 (from default tier 7).
        # Deduction = 10 * 50 = 500.
        # Net = 100 - 500 = -400 -> clamped to 0
        self.assertEqual(net1, Decimal('0.00'))

        steps = [t['step'] for t in trace1]
        self.assertIn("net_rebate_adjustment", steps)

        # Zero days worked
        net2, trace2 = calculate_rebate(
            days_worked=0,
            absent_days=0
        )
        # Base rebate = 0 (no tier met)
        self.assertEqual(net2, Decimal('0.00'))

    def test_compare_rebate_calculations(self):
        """Test the audit comparison utility."""
        old_params = {
            "days_worked": 30,
            "absent_days": 1,
            "absent_deduction_per_day": "50"
        }
        new_params = {
            "days_worked": 30,
            "absent_days": 3,
            "absent_deduction_per_day": "50"
        }

        result = compare_rebate_calculations(old_params, new_params)

        # old_net: tier 30 (600) - 1*50 = 550
        # new_net: tier 30 (600) - 3*50 = 450
        self.assertEqual(result["old_net_rebate"], "550.00")
        self.assertEqual(result["new_net_rebate"], "450.00")

        diffs = result["differences"]
        self.assertEqual(len(diffs), 1)
        self.assertEqual(diffs[0]["field"], "net_rebate")
        self.assertEqual(diffs[0]["old"], "550.00")
        self.assertEqual(diffs[0]["new"], "450.00")
        self.assertEqual(diffs[0]["delta"], "-100.00")

        self.assertIn("old_trace", result)
        self.assertIn("new_trace", result)

if __name__ == '__main__':
    unittest.main()
