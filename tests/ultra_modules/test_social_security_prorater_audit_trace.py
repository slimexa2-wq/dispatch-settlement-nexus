import unittest
import datetime
from ultra_modules.social_security_prorater_audit_trace import calculate_prorated_social_security, safe_date, safe_float

class TestSocialSecurityProrater(unittest.TestCase):
    def test_normal_full_month(self):
        """Test calculation for a full month of employment"""
        params = {
            "salary": 10000,
            "target_month": "2023-10",
            "rates": {
                "personal_social_security": 0.08,
                "company_social_security": 0.16,
                "personal_housing_fund": 0.07,
                "company_housing_fund": 0.07
            }
        }
        res = calculate_prorated_social_security(params)
        result = res["result"]

        self.assertEqual(result["prorated_fraction"], 1.0)
        self.assertEqual(result["capped_base"], 10000.0)
        self.assertEqual(result["prorated_base"], 10000.0)

        # 10000 * 0.08 = 800, 10000 * 0.07 = 700 -> 1500
        self.assertEqual(result["contributions"]["personal"]["total"], 1500.0)
        # 10000 * 0.16 = 1600, 10000 * 0.07 = 700 -> 2300
        self.assertEqual(result["contributions"]["company"]["total"], 2300.0)

    def test_partial_month(self):
        """Test calculation for someone joining mid-month"""
        params = {
            "salary": 20000,
            "target_month": "2023-11",
            "join_date": "2023-11-16",
            # November has 30 days. Active days = 30 - 16 + 1 = 15. Fraction = 15/30 = 0.5
        }
        res = calculate_prorated_social_security(params)
        result = res["result"]

        self.assertEqual(result["prorated_fraction"], 0.5)
        self.assertEqual(result["prorated_base"], 10000.0)
        self.assertEqual(result["capped_base"], 20000.0)

    def test_dirty_data_self_healing(self):
        """Test how it handles invalid types and stringified numbers"""
        params = {
            "salary": "invalid_string_salary", # Should default to 0.0, but bound min is 3000
            "target_month": "not_a_date",      # Should default to current month
            "join_date": ["invalid", "type"],  # Should default to None
            "rates": "not_a_dict",             # Should default to {}
        }
        res = calculate_prorated_social_security(params)
        result = res["result"]

        self.assertEqual(result["capped_base"], 3000.0) # Hit the minimum bound default
        self.assertEqual(result["prorated_fraction"], 1.0) # Full month if no valid join/leave dates

        # Ensure audit trace logged the data cleaning
        audit_trace = res["audit_trace"]
        self.assertTrue(any(log["action"] == "CLEAN_DATA" for log in audit_trace))

    def test_missing_parameter_fallbacks(self):
        """Test calculation with entirely empty params"""
        res = calculate_prorated_social_security({})
        result = res["result"]

        self.assertEqual(result["capped_base"], 3000.0) # Default min base
        self.assertEqual(result["prorated_fraction"], 1.0)

        # Default rates: 8%, 16%, 7%, 7%
        self.assertEqual(result["contributions"]["personal"]["total"], 450.0) # 3000 * 0.15
        self.assertEqual(result["contributions"]["company"]["total"], 690.0)  # 3000 * 0.23

    def test_extreme_boundaries(self):
        """Test join and leave on the same day, capping max salary"""
        params = {
            "salary": 1000000, # Way above max base
            "target_month": "2024-02", # Leap year, 29 days
            "join_date": "2024-02-15",
            "leave_date": "2024-02-15", # Worked only 1 day
        }
        res = calculate_prorated_social_security(params)
        result = res["result"]

        self.assertEqual(result["capped_base"], 30000.0) # Max default base
        self.assertAlmostEqual(result["prorated_fraction"], 1/29, places=4)

        expected_prorated_base = 30000.0 * (1/29)
        self.assertAlmostEqual(result["prorated_base"], expected_prorated_base, places=2)

    def test_safe_float(self):
        self.assertEqual(safe_float("123.45"), 123.45)
        self.assertEqual(safe_float(None, 10.0), 10.0)
        self.assertEqual(safe_float([], 5.0), 5.0)

    def test_safe_date(self):
        self.assertEqual(safe_date("2023-10-01"), datetime.date(2023, 10, 1))
        self.assertEqual(safe_date("2023-10-01T12:00:00Z"), datetime.date(2023, 10, 1))
        self.assertIsNone(safe_date(None))
        self.assertIsNone(safe_date("invalid"))

if __name__ == "__main__":
    unittest.main()
