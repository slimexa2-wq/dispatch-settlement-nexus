import unittest
from ultra_modules.supplier_invoice_vat_checker_integration_bridge import calculate_vat_deduction_and_compliance

class TestVATCheckerIntegrationBridge(unittest.TestCase):

    def test_normal_special_invoice_6_percent(self):
        """Test normal execution for a 6% special invoice (compliant and deductible)."""
        data = {
            "amount": 1060.0,
            "invoiceType": "special",
            "vatRate": 6.0,
            "isDifferential": False
        }
        result = calculate_vat_deduction_and_compliance(data)
        self.assertTrue(result['is_compliant'])
        self.assertEqual(result['compliance_message'], "Compliant")
        # 1060 / 1.06 * 0.06 = 60.0
        self.assertEqual(result['deduction_amount'], 60.0)

    def test_dirty_data_self_healing(self):
        """Test dirty data healing (strings with currency symbols, alternative keys, float as string)."""
        data = {
            "invoice_amount": "¥ 1,030.00",  # Dirty amount string
            "type": "专票",                    # Alternative type key and dirty value
            "taxRate": "0.03",                # Alternative rate key and string value
            "is_differential": "false"        # Alternative bool string
        }
        result = calculate_vat_deduction_and_compliance(data)
        self.assertTrue(result['is_compliant'])
        # 1030 / 1.03 * 0.03 = 30.0
        self.assertEqual(result['deduction_amount'], 30.0)
        self.assertEqual(result['standardized_data']['amount'], 1030.0)
        self.assertEqual(result['standardized_data']['invoiceType'], 'special')
        self.assertEqual(result['standardized_data']['vatRate'], 0.03)

    def test_missing_parameter_default_fallback(self):
        """Test missing parameter fallback (empty dict should fall back gracefully)."""
        data = {}
        result = calculate_vat_deduction_and_compliance(data)
        # Should default to amount 0.0, ordinary invoice, 0 vat rate, etc.
        # Since amount is 0, it should be marked as non-compliant due to invalid amount
        self.assertFalse(result['is_compliant'])
        self.assertEqual(result['compliance_message'], "Invalid amount")
        self.assertEqual(result['deduction_amount'], 0.0)
        self.assertEqual(result['standardized_data']['invoiceType'], 'ordinary')

    def test_extreme_boundary_differential_mismatch(self):
        """Test extreme boundary condition: differential tax flagged but rate is not 5%."""
        data = {
            "amount": 1000,
            "invoiceType": "special",
            "vatRate": 6,
            "isDifferential": True
        }
        result = calculate_vat_deduction_and_compliance(data)
        self.assertFalse(result['is_compliant'])
        self.assertEqual(result['compliance_message'], "Differential tax requires 5% rate, got 6.0%")
        self.assertEqual(result['deduction_amount'], 0.0)

    def test_ordinary_invoice_no_deduction(self):
        """Test normal execution for ordinary invoice (compliant but no deduction)."""
        data = {
            "totalAmount": 1010.0,
            "invoice_type": "ordinary",
            "rate": 1, # 1% rate
            "differential_tax": False
        }
        result = calculate_vat_deduction_and_compliance(data)
        self.assertTrue(result['is_compliant'])
        self.assertEqual(result['deduction_amount'], 0.0)
        self.assertEqual(result['standardized_data']['vatRate'], 1.0)

    def test_invalid_rate(self):
        """Test invalid VAT rate (e.g. 13% for labor is not in 6/3/1/5)."""
        data = {
            "amount": 1130.0,
            "invoiceType": "special",
            "vatRate": 13.0,
            "isDifferential": False
        }
        result = calculate_vat_deduction_and_compliance(data)
        self.assertFalse(result['is_compliant'])
        self.assertEqual(result['compliance_message'], "Invalid VAT rate: 13.0%")
        self.assertEqual(result['deduction_amount'], 0.0)

    def test_dirty_amount_empty_string(self):
        """Test dirty amount that cleans to empty."""
        data = {
            "amount": "abc",  # will clean to empty
            "invoiceType": "special",
            "vatRate": 6.0
        }
        result = calculate_vat_deduction_and_compliance(data)
        self.assertFalse(result['is_compliant'])
        self.assertEqual(result['compliance_message'], "Invalid amount")
        self.assertEqual(result['standardized_data']['amount'], 0.0)

if __name__ == '__main__':
    unittest.main()
