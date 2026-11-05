import unittest
import math

from ultra_modules.four_way_commission_auditor_core_engine import audit_commission

class TestFourWayCommissionAuditorCoreEngine(unittest.TestCase):

    def test_normal_case(self):
        """Test the normal execution path with standard parameters."""
        data = {
            'base_salary': 10000.0,
            'attendance_days': 20.0,
            'expected_days': 22.0,
            'subsidies': 500.0,
            'policy_multiplier': 1.1,
            'last_month_commission': 200.0,
            'max_cap': 15000.0
        }
        # (10000 * (20/22) + 500) * 1.1 + 200
        # = (9090.90909090909 + 500) * 1.1 + 200
        # = 9590.90909090909 * 1.1 + 200
        # = 10550.0 + 200 = 10750.0
        result = audit_commission(data)
        self.assertAlmostEqual(result, 10750.0, places=2)

    def test_dirty_data_silent_cleaning(self):
        """Test with dirty data like strings, weird formats, and NaNs."""
        data = {
            'base_salary': '10,000.5',
            'attendance_days': 'twenty', # Should default to 0
            'expected_days': 22.0,
            'subsidies': math.nan, # Should default to 0
            'policy_multiplier': '1.5x multiplier',
            'last_month_commission': None,
            'max_cap': float('inf') # Should default to 0 (no cap applied if max_cap=0)
        }
        # base = 10000.5
        # attendance = 0 -> ratio = 0
        # amount = (10000.5 * 0 + 0) * 1.5 + 0 = 0.0
        result = audit_commission(data)
        self.assertAlmostEqual(result, 0.0, places=2)

        data2 = {
            'base_salary': '10,000.5',
            'attendance_days': '22',
            'expected_days': 22.0,
            'subsidies': '100',
            'policy_multiplier': '1.5x multiplier',
        }
        # base = 10000.5, attendance = 22, expected = 22
        # amount = (10000.5 * 1 + 100) * 1.5 + 0 = 10100.5 * 1.5 = 15150.75
        result2 = audit_commission(data2)
        self.assertAlmostEqual(result2, 15150.75, places=2)

    def test_missing_parameters_fallback(self):
        """Test missing parameters fall back to safe defaults."""
        # Empty dict should fallback safely
        self.assertEqual(audit_commission({}), 0.0)
        # None data should fallback safely
        self.assertEqual(audit_commission(None), 0.0)

        data = {
            'base_salary': 5000.0,
            # Missing expected_days means no penalty applied (fallback to 0)
        }
        # base_salary = 5000.0
        # policy_multiplier defaults to 1.0
        # expected_days defaults to 0.0, skips penalty check
        self.assertEqual(audit_commission(data), 5000.0)

    def test_extreme_boundaries(self):
        """Test extreme boundary cases."""
        data = {
            'base_salary': -5000.0, # Negative base
            'attendance_days': 25.0,
            'expected_days': 22.0, # Attendance ratio > 1, capped at 1
            'subsidies': -1000.0,
            'policy_multiplier': -1.0, # Multiplier < 0, capped at 0
            'last_month_commission': -500.0,
            'max_cap': -100.0
        }
        # amount = -5000.0
        # ratio capped at 1.0 -> amount = -5000.0
        # subsidies = -1000.0 -> amount = -6000.0
        # multiplier capped at 0.0 -> amount = 0.0
        # last_month_commission = -500.0 -> amount = -500.0
        # max_cap < 0 not applied
        # amount < 0 -> amount = 0.0 (Zero floors)
        result = audit_commission(data)
        self.assertEqual(result, 0.0)

    def test_max_cap_logic(self):
        """Test the max cap logic."""
        data = {
            'base_salary': 50000.0,
            'attendance_days': 22.0,
            'expected_days': 22.0,
            'subsidies': 0.0,
            'policy_multiplier': 2.0,
            'last_month_commission': 5000.0,
            'max_cap': 80000.0
        }
        # amount = 50000 * 1 = 50000
        # amount = 50000 * 2 = 100000
        # amount = 100000 + 5000 = 105000
        # 105000 > 80000 -> amount = 80000
        result = audit_commission(data)
        self.assertEqual(result, 80000.0)

if __name__ == '__main__':
    unittest.main()
