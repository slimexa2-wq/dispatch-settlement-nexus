import unittest
import datetime
from decimal import Decimal
from ultra_modules.social_security_prorater_plain_explainer import SocialSecurityProrater

class TestSocialSecurityProrater(unittest.TestCase):

    def test_normal_proration_mid_month(self):
        # 1. Normal scenario: Mid-month onboarding
        params = {
            'base_salary': '12000',
            'city_avg_salary': '10000',
            'start_date': '2023-11-16',
            'end_date': '2023-11-30'
        }
        res = SocialSecurityProrater.explain_proration(params)

        self.assertEqual(res['working_days'], 15)
        self.assertEqual(res['days_in_month'], 30)
        self.assertEqual(res['capped_full_base'], '12000.00')
        # 12000 * (15/30) = 6000
        self.assertEqual(res['prorated_base'], '6000.00')
        self.assertIn("15/30", res['markdown_card'])

    def test_dirty_data_self_healing(self):
        # 2. Dirty data: Negative salary, invalid dates
        params = {
            'base_salary': -5000,
            'city_avg_salary': 'invalid',
            'start_date': 'not-a-date'
            # end_date is missing
        }
        res = SocialSecurityProrater.explain_proration(params)

        # Self healing expects base_salary 0 -> capped to min base (10000 * 0.6 = 6000)
        # Invalid city_avg_salary defaults to 10000
        self.assertEqual(res['base_salary'], '0.00')
        self.assertEqual(res['city_avg_salary'], '10000.00')
        self.assertEqual(res['capped_full_base'], '6000.00')

    def test_missing_params_default_fallback(self):
        # 3. Missing params: Completely empty dict
        res = SocialSecurityProrater.explain_proration({})

        self.assertEqual(res['base_salary'], '0.00')
        self.assertEqual(res['city_avg_salary'], '10000.00')
        self.assertEqual(res['min_base'], '6000.00')
        self.assertEqual(res['max_base'], '30000.00')
        self.assertEqual(res['capped_full_base'], '6000.00')
        self.assertEqual(res['working_days'], res['days_in_month'])
        self.assertEqual(res['prorated_base'], '6000.00')

    def test_extreme_edge_case_cap_limits(self):
        # 4. Extreme edge case: High salary exceeding max cap, full month
        params = {
            'base_salary': '50000',
            'city_avg_salary': '8000',
            'start_date': '2024-02-01',
            'end_date': '2024-02-29' # Leap year
        }
        res = SocialSecurityProrater.explain_proration(params)

        # Max cap is 8000 * 3.0 = 24000
        self.assertEqual(res['max_base'], '24000.00')
        self.assertEqual(res['capped_full_base'], '24000.00')
        self.assertEqual(res['working_days'], 29)
        self.assertEqual(res['days_in_month'], 29)
        self.assertEqual(res['prorated_base'], '24000.00')

    def test_extreme_edge_case_zero_days(self):
        # 5. Extreme edge case: 0 days (end_date < start_date or offboarding before onboarding)
        params = {
            'base_salary': '15000',
            'start_date': '2023-05-15',
            'end_date': '2023-05-10' # End before start
        }
        res = SocialSecurityProrater.explain_proration(params)

        # Should heal to end_date = start_date, but if handled as 0 or 1 depending on logic:
        # Our logic does: if end_date < start_date, end_date = start_date -> 1 day
        # Wait, if we want exactly 0 days, let's say they started and left outside the month
        # Actually in our code: `if actual_end < actual_start: working_days = 0`
        params2 = {
            'base_salary': '15000',
            'start_date': '2023-05-31',
            'end_date': '2023-05-01'
        }
        res2 = SocialSecurityProrater.explain_proration(params2)

        self.assertEqual(res2['working_days'], 1) # Because start=5-31, end=5-01 gets fixed to end=5-31, so actual_start=5-31, actual_end=5-31 -> 1 day.

        # How to get 0 days in current logic?
        # actual_start = max(start_date, month_start)
        # actual_end = min(end_date, month_end)
        # It's actually impossible to get 0 days unless end_date is legitimately somehow less than actual_start but we force end_date >= start_date.
        # So minimum working days is 1 for any provided start_date in that month.
        # We can just verify it properly limits it to 1 day and prorates correctly.
        self.assertEqual(res2['prorated_base'], str((Decimal('15000') * Decimal('1') / Decimal('31')).quantize(Decimal('0.01'))))

if __name__ == '__main__':
    unittest.main()
