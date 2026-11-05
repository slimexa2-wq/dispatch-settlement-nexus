import unittest
import json
from ultra_modules.supplier_invoice_vat_checker_plain_explainer import SupplierInvoiceVatCheckerPlainExplainer

class TestSupplierInvoiceVatCheckerPlainExplainer(unittest.TestCase):
    def setUp(self):
        self.special_invoice_valid_result = {
            'is_valid': True,
            'applied_invoice_type': '专票',
            'applied_vat_rate': '6%',
            'amount_without_tax': 100.0,
            'tax_amount': 6.0,
            'deductible_amount': 6.0
        }
        self.general_invoice_valid_result = {
            'is_valid': True,
            'applied_invoice_type': '普票',
            'applied_vat_rate': '3%',
            'amount_without_tax': 100.0,
            'tax_amount': 3.0,
            'deductible_amount': 0.0
        }

    def test_normal_case_special_invoice(self):
        # 1. Normal case for special invoice with JSON output
        result_json = SupplierInvoiceVatCheckerPlainExplainer.explain(self.special_invoice_valid_result, 'json')
        result_dict = json.loads(result_json)
        self.assertIn("6%", result_dict['title'])
        self.assertIn("100.00", result_dict['summary'])
        self.assertIn("6.00", result_dict['summary'])
        self.assertEqual("可抵扣 6.00 元", result_dict['highlight'])

        # 2. Normal case for special invoice with Markdown output
        result_md = SupplierInvoiceVatCheckerPlainExplainer.explain(self.special_invoice_valid_result, 'markdown')
        self.assertIn("✅ 收到一张 6% 增值税专用发票", result_md)
        self.assertIn("`可抵扣 6.00 元`", result_md)

        # 3. Normal case for special invoice with HTML output
        result_html = SupplierInvoiceVatCheckerPlainExplainer.explain(self.special_invoice_valid_result, 'html')
        self.assertIn("✅ 收到一张 6% 增值税专用发票", result_html)
        self.assertIn(">可抵扣 6.00 元</span>", result_html)

    def test_normal_case_general_invoice(self):
        # Normal case for general invoice
        result_json = SupplierInvoiceVatCheckerPlainExplainer.explain(self.general_invoice_valid_result, 'json')
        result_dict = json.loads(result_json)
        self.assertIn("普通发票", result_dict['title'])
        self.assertEqual("不可抵扣", result_dict['highlight'])

    def test_dirty_data_self_healing(self):
        # String instead of dictionary (valid JSON string)
        json_str = json.dumps(self.special_invoice_valid_result)
        result_json = SupplierInvoiceVatCheckerPlainExplainer.explain(json_str, 'json')
        result_dict = json.loads(result_json)
        self.assertEqual("可抵扣 6.00 元", result_dict['highlight'])

        # Invalid JSON string
        result_invalid_json = SupplierInvoiceVatCheckerPlainExplainer.explain("{invalid_json: 123", 'json')
        result_dict = json.loads(result_invalid_json)
        self.assertEqual("无法抵扣", result_dict['highlight'])

        # Completely wrong type
        result_int = SupplierInvoiceVatCheckerPlainExplainer.explain(12345, 'json')
        result_dict = json.loads(result_int)
        self.assertEqual("无法抵扣", result_dict['highlight'])

    def test_missing_params_fallback(self):
        # Incomplete dictionary
        incomplete_data = {
            'is_valid': True,
            'applied_invoice_type': '专票'
        }
        result_json = SupplierInvoiceVatCheckerPlainExplainer.explain(incomplete_data, 'json')
        result_dict = json.loads(result_json)
        self.assertIn("0%", result_dict['title'])
        self.assertEqual("可抵扣 0.00 元", result_dict['highlight'])

        # Another fallback case
        result_empty_json = SupplierInvoiceVatCheckerPlainExplainer.explain({}, 'json')
        result_dict = json.loads(result_empty_json)
        self.assertEqual("无法抵扣", result_dict['highlight'])

        # Invalid output format fallback to json
        result_bad_format = SupplierInvoiceVatCheckerPlainExplainer.explain(self.special_invoice_valid_result, 'invalid_format')
        result_dict = json.loads(result_bad_format)
        self.assertEqual("可抵扣 6.00 元", result_dict['highlight'])

    def test_extreme_edge_cases(self):
        # Negative values in results
        extreme_data = {
            'is_valid': True,
            'applied_invoice_type': '专票',
            'amount_without_tax': -100.0,
            'tax_amount': -6.0,
            'deductible_amount': -6.0
        }
        result_json = SupplierInvoiceVatCheckerPlainExplainer.explain(extreme_data, 'json')
        result_dict = json.loads(result_json)
        self.assertIn("0.00", result_dict['summary'])
        self.assertEqual("可抵扣 0.00 元", result_dict['highlight'])

        # Non-numeric types where numeric is expected
        invalid_numeric_data = {
            'is_valid': True,
            'applied_invoice_type': '专票',
            'amount_without_tax': "100块",
            'tax_amount': None,
            'deductible_amount': [1,2,3]
        }
        result_json = SupplierInvoiceVatCheckerPlainExplainer.explain(invalid_numeric_data, 'json')
        result_dict = json.loads(result_json)
        self.assertIn("0.00", result_dict['summary'])
        self.assertEqual("可抵扣 0.00 元", result_dict['highlight'])

if __name__ == '__main__':
    unittest.main()
