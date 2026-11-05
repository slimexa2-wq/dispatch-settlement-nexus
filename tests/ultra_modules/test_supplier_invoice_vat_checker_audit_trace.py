import unittest
from ultra_modules.supplier_invoice_vat_checker_audit_trace import InvoiceVatChecker

class TestInvoiceVatChecker(unittest.TestCase):
    def setUp(self):
        self.checker = InvoiceVatChecker()

    def test_normal_operation(self):
        """Test with normal special invoice and 6% tax rate."""
        data = {
            'amount': 1060.0,
            'tax_rate': 0.06,
            'invoice_type': 'special'
        }
        result = self.checker.check_and_calculate(data)

        self.assertEqual(result['original_amount'], 1060.0)
        self.assertEqual(result['effective_tax_rate'], 0.06)
        self.assertEqual(result['invoice_type'], 'special')
        self.assertEqual(result['deductible_vat'], 60.0)
        self.assertEqual(result['net_amount'], 1000.0)
        self.assertTrue(any('Special invoice' in log for log in result['_audit_trace']))

    def test_dirty_data_self_healing(self):
        """Test self-healing with dirty data (string amount, negative values, percentage string)."""
        data = {
            'amount': " $-1,060.50 ",  # Dirty string with negative and currency
            'tax_rate': "6",           # String integer for tax rate, should be converted to 0.06
            'invoice_type': " 专用发票 " # Chinese for special, with whitespace
        }
        result = self.checker.check_and_calculate(data)

        self.assertEqual(result['original_amount'], 1060.50)
        self.assertEqual(result['effective_tax_rate'], 0.06)
        self.assertEqual(result['invoice_type'], 'special')
        self.assertAlmostEqual(result['deductible_vat'], 60.03, places=2)
        self.assertAlmostEqual(result['net_amount'], 1000.47, places=2)

        # Verify audit logs captured the healing
        logs = result['_audit_trace']
        self.assertTrue(any('attempting to parse' in log for log in logs))
        self.assertTrue(any('parsed amount is negative' in log.lower() for log in logs))
        self.assertTrue(any('dividing by 100' in log for log in logs))

    def test_missing_parameter_fallbacks(self):
        """Test default fallback when parameters are missing or invalid."""
        result = self.checker.check_and_calculate(None)  # Pass None instead of dict

        self.assertEqual(result['original_amount'], 0.0)
        self.assertEqual(result['effective_tax_rate'], 0.03) # Default 3%
        self.assertEqual(result['invoice_type'], 'general')  # Default general
        self.assertEqual(result['deductible_vat'], 0.0)

        logs = result['_audit_trace']
        self.assertTrue(any('not a dictionary' in log for log in logs))
        self.assertTrue(any('Amount missing' in log for log in logs))
        self.assertTrue(any('Tax rate missing' in log for log in logs))

    def test_extreme_boundaries(self):
        """Test extreme boundaries like 0 amount, extremely large numbers, invalid strings."""
        data = {
            'amount': "not a number",
            'tax_rate': 999.0, # Invalid tax rate
            'invoice_type': "unknown_type"
        }
        result = self.checker.check_and_calculate(data)

        self.assertEqual(result['original_amount'], 0.0)
        self.assertEqual(result['effective_tax_rate'], 0.03) # Fallback to 3%
        self.assertEqual(result['invoice_type'], 'general')
        self.assertEqual(result['deductible_vat'], 0.0)

        # Test large numbers
        data2 = {
            'amount': 1000000000000.0,
            'tax_rate': 0.01,
            'invoice_type': 'special'
        }
        result2 = self.checker.check_and_calculate(data2)
        self.assertEqual(result2['original_amount'], 1000000000000.0)
        self.assertAlmostEqual(result2['deductible_vat'], 9900990099.01, places=2)

    def test_special_case_tax_rates(self):
        """Test diff tax 5% rate and verify deduction is 0 for general invoices."""
        # Special invoice with 5% diff tax
        data_special = {
            'amount': 1050.0,
            'tax_rate': 0.05,
            'invoice_type': 'special'
        }
        result_special = self.checker.check_and_calculate(data_special)
        self.assertEqual(result_special['effective_tax_rate'], 0.05)
        self.assertEqual(result_special['deductible_vat'], 50.0)

        # General invoice with 6% tax rate
        data_general = {
            'amount': 1060.0,
            'tax_rate': 0.06,
            'invoice_type': 'general'
        }
        result_general = self.checker.check_and_calculate(data_general)
        # General invoice should yield 0 deductible VAT
        self.assertEqual(result_general['deductible_vat'], 0.0)
        self.assertEqual(result_general['net_amount'], 1060.0)
        self.assertTrue(any('General invoice: VAT deduction is 0.0' in log for log in result_general['_audit_trace']))

if __name__ == '__main__':
    unittest.main()
