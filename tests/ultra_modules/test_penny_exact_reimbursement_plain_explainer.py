import unittest
import json
from ultra_modules.penny_exact_reimbursement_plain_explainer import generate_explainer_card, sanitize_amount

class TestPennyExactReimbursementPlainExplainer(unittest.TestCase):

    def test_normal_valid_input(self):
        """Test normal positive float/string amounts and a valid invoice list."""
        result = generate_explainer_card(1234.56, ["INV-001", "INV-002"], output_format="JSON")
        data = json.loads(result)
        self.assertEqual(data["exact_cents"], 123456)
        self.assertEqual(data["valid_invoices_count"], 2)
        self.assertEqual(data["valid_invoices"], ["INV-001", "INV-002"])
        self.assertFalse(data["has_duplicates"])
        self.assertEqual(data["conclusion"], "审核通过。")

    def test_dirty_data_auto_healing(self):
        """Test input with spaces, commas, and currency signs."""
        result_usd = generate_explainer_card("$ 1,234.56", ["INV-003"], output_format="JSON")
        data_usd = json.loads(result_usd)
        self.assertEqual(data_usd["exact_cents"], 123456)

        result_rmb = generate_explainer_card("￥ 50.00", ["INV-004"], output_format="JSON")
        data_rmb = json.loads(result_rmb)
        self.assertEqual(data_rmb["exact_cents"], 5000)

        result_spaces = generate_explainer_card("  1000.12  ", ["INV-005"], output_format="JSON")
        data_spaces = json.loads(result_spaces)
        self.assertEqual(data_spaces["exact_cents"], 100012)

    def test_missing_parameter_default(self):
        """Test calling with missing or None amount_yuan and invoices, expecting sensible default return."""
        result = generate_explainer_card()
        data = json.loads(result)
        self.assertEqual(data["exact_cents"], 0)
        self.assertEqual(data["valid_invoices_count"], 0)
        self.assertEqual(data["valid_invoices"], [])
        self.assertFalse(data["has_duplicates"])
        self.assertEqual(data["conclusion"], "提示：报销金额为 0 或输入无效，无需打款。")

        result_none = generate_explainer_card(None, None, "HTML")
        self.assertIn("核准报销金额：</strong>0.00 元（即 0 分）", result_none)

    def test_extreme_edge_cases(self):
        """Test negative amounts, extremely small floats, and very large strings."""
        # Negative amount
        result_neg = generate_explainer_card(-100.50, ["INV-006"])
        data_neg = json.loads(result_neg)
        self.assertEqual(data_neg["exact_cents"], 0)

        # Extremely small float
        result_small = generate_explainer_card(0.00001, ["INV-007"])
        data_small = json.loads(result_small)
        self.assertEqual(data_small["exact_cents"], 0)

        # Very large string
        result_large = generate_explainer_card("999999999.99", ["INV-008"])
        data_large = json.loads(result_large)
        self.assertEqual(data_large["exact_cents"], 99999999999)

        # Invalid string that can't be parsed after sanitization
        result_invalid = generate_explainer_card("Not a number", ["INV-009"])
        data_invalid = json.loads(result_invalid)
        self.assertEqual(data_invalid["exact_cents"], 0)

    def test_duplicate_invoice_detection(self):
        """Test a list with identical duplicate invoices to ensure deduplication."""
        result = generate_explainer_card(500, ["INV-100", "INV-101", "INV-100", "INV-102", "INV-101"], output_format="MARKDOWN")

        self.assertIn("- **核准报销金额**：500 元（即 50000 分）", result)
        self.assertIn("- **有效发票数量**：3 张", result)
        self.assertIn("- **发票明细**：INV-100, INV-101, INV-102", result)
        self.assertIn("- **处理结论**：警告：发现重复发票（INV-100, INV-101），已自动剔除。", result)

        result_json = generate_explainer_card(500, ["INV-100", "INV-101", "INV-100", "INV-102", "INV-101"])
        data = json.loads(result_json)
        self.assertEqual(data["valid_invoices_count"], 3)
        self.assertEqual(data["valid_invoices"], ["INV-100", "INV-101", "INV-102"])
        self.assertTrue(data["has_duplicates"])
        self.assertEqual(data["conclusion"], "警告：发现重复发票（INV-100, INV-101），已自动剔除。")

if __name__ == '__main__':
    unittest.main()
