import unittest
import time
from ultra_modules.supplier_invoice_vat_checker_self_healing_guard import VATCheckerGuard

class TestVATCheckerGuard(unittest.TestCase):
    def setUp(self):
        self.checker = VATCheckerGuard()

    def test_normal_case_special_invoice(self):
        # Normal valid data for 6% special invoice
        data = {
            'inclusive_amount': 1060,
            'rate': 0.06,
            'type': 'special'
        }
        res = self.checker.calculate_deduction(data)
        result = res['result']

        self.assertEqual(result['inclusive_amount'], 1060)
        self.assertEqual(result['rate'], 0.06)
        self.assertEqual(result['type'], 'special')
        self.assertEqual(result['calculated_tax'], 60.0)
        self.assertEqual(result['deductible_tax'], 60.0)

        # Test valid undo within 5 seconds
        undo_res = self.checker.undo(res['snapshot_id'])
        self.assertEqual(undo_res['calculated_tax'], 60.0)

        # Subsequent undo with same id should return None (silent fail)
        self.assertIsNone(self.checker.undo(res['snapshot_id']))

    def test_dirty_data_self_healing(self):
        # Dirty data: strings, invalid types, negative numbers
        data = {
            'inclusive_amount': '-1060', # should be clamped to 0
            'rate': '6%',               # should be parsed to 0.06
            'difference_deduction': 'invalid', # should be 0.0
            'type': 123                 # should be cast to '123'
        }
        res = self.checker.calculate_deduction(data)
        result = res['result']

        self.assertEqual(result['inclusive_amount'], 0.0)
        self.assertEqual(result['rate'], 0.06)
        self.assertEqual(result['difference_deduction'], 0.0)
        self.assertEqual(result['type'], '123')
        self.assertEqual(result['calculated_tax'], 0.0)

        # Another test for rate normalization (e.g. 3 instead of 0.03)
        data2 = {
            'inclusive_amount': '1030',
            'rate': 3.0,
            'type': 'special'
        }
        res2 = self.checker.calculate_deduction(data2)
        self.assertEqual(res2['result']['rate'], 0.03)
        self.assertEqual(res2['result']['calculated_tax'], 30.0)

        # Another test for closest rate matching (e.g. 0.058 instead of 0.06)
        data3 = {
            'inclusive_amount': '1060',
            'rate': 0.058,
            'type': 'special'
        }
        res3 = self.checker.calculate_deduction(data3)
        self.assertEqual(res3['result']['rate'], 0.06)

    def test_missing_parameters_fallback(self):
        # Empty dict
        res1 = self.checker.calculate_deduction({})
        self.assertEqual(res1['result']['inclusive_amount'], 0.0)
        self.assertEqual(res1['result']['rate'], 0.0)

        # None passed
        res2 = self.checker.calculate_deduction(None)
        self.assertEqual(res2['result']['inclusive_amount'], 0.0)
        self.assertEqual(res2['result']['rate'], 0.0)

    def test_difference_method_boundaries(self):
        # Normal difference method at 5%
        data = {
            'inclusive_amount': 1050,
            'difference_deduction': 525,
            'is_difference': True,
            'rate': 0.05,
            'type': 'special'
        }
        res = self.checker.calculate_deduction(data)
        self.assertEqual(res['result']['rate'], 0.05)
        self.assertEqual(res['result']['calculated_tax'], 25.0) # (1050 - 525) / 1.05 * 0.05

        # Extreme boundary: difference deduction > inclusive amount
        data2 = {
            'inclusive_amount': 1000,
            'difference_deduction': 2000,
            'is_difference': True,
            'rate': 0.05,
            'type': 'special'
        }
        res2 = self.checker.calculate_deduction(data2)
        # It should self-heal and clamp difference_deduction to inclusive_amount (1000)
        self.assertEqual(res2['result']['difference_deduction'], 1000.0)
        self.assertEqual(res2['result']['calculated_tax'], 0.0) # (1000 - 1000) / 1.05 * 0.05

    def test_undo_time_limit(self):
        # Set a very short TTL for this test
        self.checker._snapshot_ttl = 0.1

        res = self.checker.calculate_deduction({'inclusive_amount': 100})
        snapshot_id = res['snapshot_id']

        # Wait slightly longer than TTL
        time.sleep(0.15)

        # Attempt undo, should fail silently (return None)
        undo_res = self.checker.undo(snapshot_id)
        self.assertIsNone(undo_res)

        # Try undoing an invalid ID
        self.assertIsNone(self.checker.undo("invalid_id"))
        self.assertIsNone(self.checker.undo(None))

    def test_normal_invoice_fallback(self):
        # Normal invoices usually don't have deductible input VAT
        data = {
            'inclusive_amount': 1060,
            'rate': 0.06,
            'type': 'normal'
        }
        res = self.checker.calculate_deduction(data)
        self.assertEqual(res['result']['calculated_tax'], 0.0)
        self.assertEqual(res['result']['deductible_tax'], 0.0)

if __name__ == '__main__':
    unittest.main()
