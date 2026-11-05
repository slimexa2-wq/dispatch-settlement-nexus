import unittest
import sys
import os

# Ensure the module can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from ultra_modules.ResignedWorkerPayHold_core_engine import calculate_resigned_worker_pay

class TestResignedWorkerPayHoldCoreEngine(unittest.TestCase):
    def test_normal_case_abrupt_resignation(self):
        # Normal case with abrupt resignation, requested deduction is below cap
        result = calculate_resigned_worker_pay(
            base_salary=10000,
            deduction_requested=1500,
            is_abrupt_resignation=True,
            max_deduction_rate=0.2
        )
        self.assertEqual(result['base_salary'], 10000.0)
        self.assertTrue(result['is_abrupt_resignation'])
        self.assertEqual(result['compliance_cap'], 2000.0)
        self.assertEqual(result['actual_deduction'], 1500.0)
        self.assertEqual(result['final_pay'], 8500.0)

    def test_normal_case_not_abrupt(self):
        # Normal case without abrupt resignation, deduction should be zeroed
        result = calculate_resigned_worker_pay(
            base_salary=10000,
            deduction_requested=1500,
            is_abrupt_resignation=False
        )
        self.assertEqual(result['base_salary'], 10000.0)
        self.assertFalse(result['is_abrupt_resignation'])
        self.assertEqual(result['actual_deduction'], 0.0)
        self.assertEqual(result['final_pay'], 10000.0)

    def test_dirty_data_silent_cleaning(self):
        # Dirty data in strings, strange formatting, etc.
        result = calculate_resigned_worker_pay(
            base_salary=" $ 5,000.50 ",
            deduction_requested="abc 1500.2xyz",
            is_abrupt_resignation="Yes",
            max_deduction_rate="0.25"
        )
        self.assertEqual(result['base_salary'], 5000.50)
        self.assertTrue(result['is_abrupt_resignation'])
        self.assertEqual(result['compliance_cap'], 5000.50 * 0.25)
        # Cap is ~1250.125, requested is 1500.2
        # Should cap at max
        self.assertAlmostEqual(result['actual_deduction'], 5000.50 * 0.25)
        self.assertAlmostEqual(result['final_pay'], 5000.50 - (5000.50 * 0.25))

    def test_missing_parameters_default_fallback(self):
        # Missing or None parameters
        result = calculate_resigned_worker_pay()
        self.assertEqual(result['base_salary'], 0.0)
        self.assertFalse(result['is_abrupt_resignation'])
        self.assertEqual(result['compliance_cap'], 0.0)
        self.assertEqual(result['actual_deduction'], 0.0)
        self.assertEqual(result['final_pay'], 0.0)

        result2 = calculate_resigned_worker_pay(
            base_salary=5000,
            is_abrupt_resignation=True
            # Missing deduction and rate
        )
        self.assertEqual(result2['requested_deduction'], 0.0)
        self.assertEqual(result2['compliance_cap'], 1000.0) # 5000 * 0.2 default
        self.assertEqual(result2['actual_deduction'], 0.0)
        self.assertEqual(result2['final_pay'], 5000.0)

    def test_extreme_deduction_edge_case(self):
        # Deduction requested far exceeds base salary
        result = calculate_resigned_worker_pay(
            base_salary=8000,
            deduction_requested=15000,
            is_abrupt_resignation=True,
            max_deduction_rate=0.3
        )
        self.assertEqual(result['base_salary'], 8000.0)
        self.assertEqual(result['compliance_cap'], 2400.0)
        self.assertEqual(result['actual_deduction'], 2400.0)
        self.assertEqual(result['final_pay'], 5600.0)

    def test_invalid_rate_fallback(self):
        # Invalid rate > 1 or < 0
        result = calculate_resigned_worker_pay(
            base_salary=10000,
            deduction_requested=5000,
            is_abrupt_resignation=True,
            max_deduction_rate=1.5 # Should default to 0.2
        )
        self.assertEqual(result['compliance_cap'], 2000.0)
        self.assertEqual(result['actual_deduction'], 2000.0)
        self.assertEqual(result['final_pay'], 8000.0)

if __name__ == '__main__':
    unittest.main()
