import unittest
from ultra_modules.tiered_rebate_calculator_core_engine import calculate_tiered_rebate

class TestTieredRebateCalculatorCoreEngine(unittest.TestCase):

    def setUp(self):
        self.standard_rates = {
            "7": 100.0,
            "15": 300.0,
            "30": 700.0,
            "45": 1200.0
        }

    def test_normal_execution(self):
        """Test calculating rebate under normal conditions."""
        data = {
            "days_worked": 32,
            "absent_days": 1,
            "daily_deduction": 50.0,
            "rebate_rates": self.standard_rates
        }
        # >= 30 means 700 rate. 1 day absent * 50 = 50. Final = 650
        result = calculate_tiered_rebate(data)
        self.assertEqual(result, 650.0)

    def test_dirty_data_healing(self):
        """Test with dirty data like strings, negative values, and None."""
        data = {
            "days_worked": "16",  # string
            "absent_days": -5,    # negative, should be converted to 0
            "daily_deduction": "invalid", # invalid string, should be 0.0
            "rebate_rates": {
                "7": 100,
                "15": "300",      # string
                "30": None,       # None, should be 0.0
                "45": -100        # negative, should be 0.0
            }
        }
        # >= 15 means 300 rate (parsed from "300").
        # Absent days < 0 becomes 0, so 0 deduction. Final = 300
        result = calculate_tiered_rebate(data)
        self.assertEqual(result, 300.0)

    def test_missing_parameters_default_fallback(self):
        """Test with missing keys, expecting default to 0.0."""
        # Empty dict should fallback to all 0s
        result = calculate_tiered_rebate({})
        self.assertEqual(result, 0.0)

        # Test missing some keys
        data = {
            "days_worked": 40,
            "rebate_rates": {
                "30": 500.0
            }
        }
        # Missing daily_deduction, absent_days, so 0 deduction.
        # Days 40 >= 30 -> 500
        result = calculate_tiered_rebate(data)
        self.assertEqual(result, 500.0)

        # Passing completely invalid data structure
        result2 = calculate_tiered_rebate(None)
        self.assertEqual(result2, 0.0)

    def test_boundary_conditions(self):
        """Test exactly on tier boundaries."""
        # Exactly 7 days
        data_7 = {
            "days_worked": 7,
            "rebate_rates": self.standard_rates
        }
        self.assertEqual(calculate_tiered_rebate(data_7), 100.0)

        # Exactly 15 days
        data_15 = {
            "days_worked": 15,
            "rebate_rates": self.standard_rates
        }
        self.assertEqual(calculate_tiered_rebate(data_15), 300.0)

        # Exactly 45 days
        data_45 = {
            "days_worked": 45,
            "rebate_rates": self.standard_rates
        }
        self.assertEqual(calculate_tiered_rebate(data_45), 1200.0)

        # Just below a threshold (14 days)
        data_14 = {
            "days_worked": 14,
            "rebate_rates": self.standard_rates
        }
        self.assertEqual(calculate_tiered_rebate(data_14), 100.0)

    def test_extreme_cases(self):
        """Test high absences that would cause negative rebate, which should be floored at 0."""
        data = {
            "days_worked": 16, # Tier 15 -> 300
            "absent_days": 10,
            "daily_deduction": 50.0, # Total deduction: 500
            "rebate_rates": self.standard_rates
        }
        # 300 - 500 = -200, which should be floored at 0
        result = calculate_tiered_rebate(data)
        self.assertEqual(result, 0.0)

        # Immense days worked
        data_immense = {
            "days_worked": 99999,
            "rebate_rates": self.standard_rates
        }
        self.assertEqual(calculate_tiered_rebate(data_immense), 1200.0)

if __name__ == '__main__':
    unittest.main()
