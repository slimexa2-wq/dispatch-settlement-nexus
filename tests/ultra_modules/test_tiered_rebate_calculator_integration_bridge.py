import unittest
from ultra_modules.tiered_rebate_calculator_integration_bridge import calculate_rebate_from_legacy, bridge_rebate_data

class TestTieredRebateCalculatorIntegrationBridge(unittest.TestCase):

    def test_normal_mapping_standard_fields(self):
        """Test with correct standard fields already provided."""
        data = {
            "days_worked": 35,
            "absent_days": 2,
            "daily_deduction": 50.0,
            "rebate_rates": {
                "7": 100.0,
                "15": 200.0,
                "30": 500.0,
                "45": 1000.0
            }
        }
        # Expected: 35 days hits tier 30 (500). 2 absent days * 50 = 100. Rebate = 500 - 100 = 400.
        result = calculate_rebate_from_legacy(data)
        self.assertAlmostEqual(result, 400.0)

    def test_legacy_format_translation(self):
        """Test that legacy fields are correctly mapped to standard schema."""
        data = {
            "working_days_total": 45,
            "leave_days": 3,
            "penalty_per_day": 100.0,
            "tiers": {
                "7": 200,
                "15": 400,
                "30": 800,
                "45": 1500
            }
        }
        # Expected: 45 days hits tier 45 (1500). 3 absent days * 100 = 300. Rebate = 1500 - 300 = 1200.
        result = calculate_rebate_from_legacy(data)
        self.assertAlmostEqual(result, 1200.0)

        # Another set of aliases
        data2 = {
            "total_days_worked": 16,
            "absent_total": 1,
            "deduction_amount": 20.0,
            "tiers": {
                "7": 150,
                "15": 300
            }
        }
        # Expected: 16 days hits tier 15 (300). 1 absent * 20 = 20. Rebate = 280.
        result2 = calculate_rebate_from_legacy(data2)
        self.assertAlmostEqual(result2, 280.0)

    def test_missing_params_fallback(self):
        """Test behavior when missing parameters or passing non-dict types."""
        # Empty dict should yield 0.0
        self.assertEqual(calculate_rebate_from_legacy({}), 0.0)

        # Missing rates but some days worked
        data = {
            "days_worked": 20,
            "absent_days": 1
        }
        self.assertEqual(calculate_rebate_from_legacy(data), 0.0)

        # Non-dict inputs like None or string should safely fallback to empty dict logic -> 0.0
        self.assertEqual(calculate_rebate_from_legacy(None), 0.0)
        self.assertEqual(calculate_rebate_from_legacy("dirty string"), 0.0)

        # Test just having "tiers" without rates but being wrong type
        data_bad_tiers = {
            "days_worked": 20,
            "tiers": "invalid_string_tiers"
        }
        self.assertEqual(calculate_rebate_from_legacy(data_bad_tiers), 0.0)

    def test_dirty_data_self_healing(self):
        """Test with string values and other malformed valid inputs."""
        data = {
            "working_days_total": "18",  # string
            "absent_days": None,  # None should default to 0
            "daily_deduction": "invalid",  # invalid float should default to 0.0
            "rebate_rates": {
                "7": "150",
                "15": "350.5" # float as string
            }
        }
        # Expected: 18 days hits 15 tier (350.5). Absent = 0. Deduction = 0. Result = 350.5.
        result = calculate_rebate_from_legacy(data)
        self.assertAlmostEqual(result, 350.5)

    def test_extreme_boundary_conditions(self):
        """Test very high days, deductions exceeding rebate, negative inputs, and low days."""
        # Fix 100% coverage by hitting tier 7
        data_tier_7 = {
            "days_worked": 8,
            "absent_days": 0,
            "rebate_rates": {
                "7": 100.0
            }
        }
        self.assertEqual(calculate_rebate_from_legacy(data_tier_7), 100.0)

        # Fix 100% coverage by passing a bad rates type
        data_bad_rates_type = {
            "days_worked": 45,
            "rebate_rates": "not a dict",
            "tiers": "not a dict" # standardizes to empty dict for rates
        }
        self.assertEqual(calculate_rebate_from_legacy(data_bad_rates_type), 0.0)

        # Fix 100% coverage for safe_int exception
        data_int_error = {
            "days_worked": [1, 2, 3] # raises TypeError when passed to int()
        }
        self.assertEqual(calculate_rebate_from_legacy(data_int_error), 0.0)

        data = {
            "days_worked": 1000,
            "leave_days": 10,
            "penalty_per_day": 1000.0, # massive deduction
            "tiers": {
                "45": 5000.0
            }
        }
        # Expected: rebate is 5000, deduction is 10000. Engine should cap at 0.
        result = calculate_rebate_from_legacy(data)
        self.assertEqual(result, 0.0)

        data_neg = {
            "working_days_total": -5,
            "leave_days": -1,
            "penalty_per_day": -100.0,
            "tiers": {
                "7": -50.0
            }
        }
        # safe_int and safe_float cap negative inputs in core engine.
        # So days_worked = 0, absent_days = 0, penalty = 0.0, tier rates = 0.0. Result 0.0
        result_neg = calculate_rebate_from_legacy(data_neg)
        self.assertEqual(result_neg, 0.0)

if __name__ == '__main__':
    unittest.main()
