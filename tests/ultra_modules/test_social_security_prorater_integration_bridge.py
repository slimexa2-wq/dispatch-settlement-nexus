import unittest
import math
from ultra_modules.social_security_prorater_integration_bridge import SocialSecurityProraterBridge

class TestSocialSecurityProraterBridge(unittest.TestCase):

    def test_normal_case_standard_keys(self):
        """Test full month proration with standard schema keys."""
        params = {
            'base_salary': 10000.0,
            'min_base': 3000.0,
            'max_base': 15000.0,
            'social_rate_employee': 0.08,
            'social_rate_employer': 0.16,
            'housing_rate_employee': 0.07,
            'housing_rate_employer': 0.07,
            'proration_rule': 'full_month',
            'days_worked': 21.75,
            'standard_working_days': 21.75
        }
        res = SocialSecurityProraterBridge.calculate(params)
        self.assertEqual(res['effective_base'], 10000.0)
        self.assertEqual(res['proration_factor'], 1.0)
        self.assertEqual(res['social_employee_amt'], 800.0)
        self.assertEqual(res['social_employer_amt'], 1600.0)
        self.assertEqual(res['housing_employee_amt'], 700.0)
        self.assertEqual(res['housing_employer_amt'], 700.0)
        self.assertEqual(res['total_employee_amt'], 1500.0)
        self.assertEqual(res['total_employer_amt'], 2300.0)
        self.assertTrue(len(res['audit_log']) > 0)

    def test_legacy_keys_mapping(self):
        """Test seamless compatibility using old schema keys and by_day proration."""
        params = {
            'salary_base': 12000,
            'lower_bound': 5000,
            'upper_bound': 20000,
            'personal_social_rate': 0.08,
            'company_social_rate': 0.16,
            'emp_housing_rate': 0.07,
            'comp_housing_rate': 0.07,
            'calc_rule': 'by_day',
            'worked_days': 10.875,
            'month_days': 21.75
        }
        res = SocialSecurityProraterBridge.calculate(params)
        # Factor should be 10.875 / 21.75 = 0.5
        self.assertEqual(res['effective_base'], 12000.0)
        self.assertEqual(res['proration_factor'], 0.5)
        self.assertEqual(res['prorated_base'], 6000.0)
        self.assertEqual(res['social_employee_amt'], 480.0)  # 6000 * 0.08
        self.assertEqual(res['social_employer_amt'], 960.0)  # 6000 * 0.16
        self.assertEqual(res['housing_employee_amt'], 420.0) # 6000 * 0.07
        self.assertEqual(res['housing_employer_amt'], 420.0) # 6000 * 0.07
        self.assertTrue(any("Mapped field 'salary_base' -> 'base_salary'" in log for log in res['audit_log']))

    def test_dirty_data_self_healing(self):
        """Test fault-tolerant processing of NaNs, Infinity, and strings."""
        params = {
            'base_salary': ' 8,000.50 ', # string with spaces and comma
            'min_base': math.nan,        # NaN
            'max_base': float('inf'),    # Infinity
            'social_rate_employee': '0.08',
            'social_rate_employer': None, # Missing value
            'proration_rule': 'invalid_rule' # Invalid rule defaults to full_month
        }
        res = SocialSecurityProraterBridge.calculate(params)
        self.assertEqual(res['effective_base'], 8000.50)
        self.assertEqual(res['proration_factor'], 1.0)
        self.assertEqual(res['social_employee_amt'], 640.04) # 8000.50 * 0.08 = 640.04
        self.assertEqual(res['social_employer_amt'], 0.0)    # Rate was None, defaulted to 0
        self.assertTrue(any("Invalid proration_rule" in log for log in res['audit_log']))

    def test_missing_params_fallback(self):
        """Test completely empty parameters gracefully falling back to zero defaults."""
        res = SocialSecurityProraterBridge.calculate(None)
        self.assertEqual(res['effective_base'], 0.0)
        # Default behavior: full month, 21.75 days out of 21.75 -> factor 1.0
        self.assertEqual(res['proration_factor'], 1.0)
        self.assertEqual(res['total_employee_amt'], 0.0)
        self.assertEqual(res['total_employer_amt'], 0.0)
        self.assertTrue(any("Invalid or missing params" in log for log in res['audit_log']))

        res_empty = SocialSecurityProraterBridge.calculate({})
        self.assertEqual(res_empty['effective_base'], 0.0)
        # Because days_worked defaults to 21.75 and rule is full_month, proration_factor is 1.0 when missing.
        self.assertEqual(res_empty['proration_factor'], 1.0)

    def test_extreme_edge_cases(self):
        """Test inverted min/max bases, extra worked days, and negative standard days."""
        params = {
            'base_salary': 4000.0,
            'min_base': 10000.0,  # Swapped min and max
            'max_base': 2000.0,
            'days_worked': 30.0,  # Greater than standard
            'standard_working_days': -5.0, # Negative standard days
            'proration_rule': 'by_day'
        }
        res = SocialSecurityProraterBridge.calculate(params)

        # After swapping, min=2000, max=10000. Base 4000 is within bounds.
        self.assertEqual(res['effective_base'], 4000.0)

        # Standard days < 0 should default to 21.75
        # Worked days 30 > 21.75 should cap at 21.75
        # So proration factor should be 21.75 / 21.75 = 1.0
        self.assertEqual(res['proration_factor'], 1.0)
        self.assertEqual(res['prorated_base'], 4000.0)
        self.assertTrue(any("min_base > max_base detected" in log for log in res['audit_log']))
        self.assertTrue(any("Invalid standard_working_days" in log for log in res['audit_log']))
        self.assertTrue(any("capping at standard_days" in log for log in res['audit_log']))

if __name__ == '__main__':
    unittest.main()
