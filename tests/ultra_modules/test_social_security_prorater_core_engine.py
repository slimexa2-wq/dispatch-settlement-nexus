import unittest
import math

from ultra_modules.social_security_prorater_core_engine import calculate_proration

class TestSocialSecurityProraterCoreEngine(unittest.TestCase):

    def test_normal_calculation(self):
        """1. Normal calculation (full month)"""
        params = {
            'base_salary': 10000,
            'min_base': 5000,
            'max_base': 30000,
            'social_rate_employee': 0.08,
            'social_rate_employer': 0.16,
            'housing_rate_employee': 0.07,
            'housing_rate_employer': 0.07,
            'proration_rule': 'full_month',
            'days_worked': 21.75
        }
        res = calculate_proration(params)
        self.assertEqual(res['effective_base'], 10000.0)
        self.assertEqual(res['proration_factor'], 1.0)
        self.assertEqual(res['social_employee_amt'], 800.0)
        self.assertEqual(res['social_employer_amt'], 1600.0)
        self.assertEqual(res['housing_employee_amt'], 700.0)
        self.assertEqual(res['housing_employer_amt'], 700.0)

    def test_dirty_data_healing(self):
        """2. Dirty data healing (strings, negative values, NaN)"""
        params = {
            'base_salary': '  10,000.50  ',
            'min_base': -5000,  # Should cap effective base logically if base is smaller, but base is 10k
            'max_base': math.nan,  # Default to 9999999.0
            'social_rate_employee': '0.08',
            'social_rate_employer': None,  # Should become 0.0
            'housing_rate_employee': [0.07],  # Invalid type, should become 0.0
            'housing_rate_employer': 'invalid_string',  # Should become 0.0
            'proration_rule': ' BY_DAY ',  # Should become 'by_day'
            'days_worked': 10.875
        }
        res = calculate_proration(params)
        self.assertEqual(res['effective_base'], 10000.50)
        self.assertEqual(res['proration_factor'], 0.5)  # 10.875 / 21.75 = 0.5
        self.assertEqual(res['prorated_base'], 5000.25)
        self.assertEqual(res['social_employee_amt'], 400.02)  # 5000.25 * 0.08 = 400.02
        self.assertEqual(res['social_employer_amt'], 0.0)
        self.assertEqual(res['housing_employee_amt'], 0.0)
        self.assertEqual(res['housing_employer_amt'], 0.0)

    def test_default_parameter_fallback(self):
        """3. Default parameter fallback (empty args)"""
        res = calculate_proration(None)
        self.assertEqual(res['effective_base'], 0.0)
        self.assertEqual(res['proration_factor'], 1.0) # default days_worked is 21.75, standard is 21.75 -> factor 1.0 (full_month)
        self.assertEqual(res['social_employee_amt'], 0.0)

        res_empty = calculate_proration({})
        self.assertEqual(res_empty['effective_base'], 0.0)
        self.assertEqual(res_empty['proration_factor'], 1.0)

    def test_extreme_boundaries(self):
        """4. Extreme boundaries (very high salary hitting the cap)"""
        params = {
            'base_salary': 1000000.0,
            'min_base': 5000,
            'max_base': 30000,
            'social_rate_employee': 0.1,
            'housing_rate_employee': 0.1,
        }
        res = calculate_proration(params)
        # Should be capped at 30000
        self.assertEqual(res['effective_base'], 30000.0)
        self.assertEqual(res['social_employee_amt'], 3000.0)
        self.assertEqual(res['housing_employee_amt'], 3000.0)

        # What if min_base > max_base? Should swap them.
        params2 = {
            'base_salary': 10000,
            'min_base': 30000,
            'max_base': 5000,
            'social_rate_employee': 0.1,
        }
        res2 = calculate_proration(params2)
        # min becomes 5000, max becomes 30000, effective is 10000
        self.assertEqual(res2['effective_base'], 10000.0)

    def test_proration_type_and_edge_cases(self):
        """5. Proration type behaviors ('full_month' vs 'by_day') & edge cases (0 actual days)"""
        # full_month but 0 days worked
        res_zero = calculate_proration({
            'base_salary': 10000,
            'proration_rule': 'full_month',
            'days_worked': 0
        })
        self.assertEqual(res_zero['proration_factor'], 0.0)

        # by_day with half days worked
        res_by_day = calculate_proration({
            'base_salary': 10000,
            'proration_rule': 'by_day',
            'days_worked': 10.875
        })
        self.assertEqual(res_by_day['proration_factor'], 0.5)
        self.assertEqual(res_by_day['prorated_base'], 5000.0)

        # by_day with more days than standard (should cap at standard)
        res_over = calculate_proration({
            'base_salary': 10000,
            'proration_rule': 'by_day',
            'days_worked': 30.0,
            'standard_working_days': 21.75
        })
        self.assertEqual(res_over['proration_factor'], 1.0)
        self.assertEqual(res_over['prorated_base'], 10000.0)

        # Standard days <= 0 boundary (should fallback to 21.75)
        res_neg_std_days = calculate_proration({
            'base_salary': 10000,
            'proration_rule': 'by_day',
            'days_worked': 10.875,
            'standard_working_days': -5
        })
        self.assertEqual(res_neg_std_days['proration_factor'], 0.5)

if __name__ == '__main__':
    unittest.main()
