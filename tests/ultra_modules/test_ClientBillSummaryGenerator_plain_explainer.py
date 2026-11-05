import unittest
import math
from ultra_modules.ClientBillSummaryGenerator_plain_explainer import generate_plain_explainer

class TestClientBillSummaryGeneratorPlainExplainer(unittest.TestCase):

    def test_normal_json(self):
        data = {
            'total_hours': 120.5,
            'total_base_cost': 12050.0,
            'management_fee_rate': 0.05,
            'management_fee': 602.5,
            'tax_rate': 0.06,
            'tax': 759.15,
            'subtotal': 12652.5,
            'grand_total': 13411.65
        }
        res = generate_plain_explainer(data, 'json')
        self.assertEqual(res['title'], "本月结算确认单（大白话版）")
        self.assertIn("120.5 小时", res['summary'])
        self.assertIn("13411.65 元", res['summary'])
        self.assertIn("12050.00 元", res['details'][0])
        self.assertIn("5%", res['details'][1])
        self.assertIn("602.50 元", res['details'][1])
        self.assertIn("6%", res['details'][2])
        self.assertIn("759.15 元", res['details'][2])
        self.assertIn("13411.65 元", res['conclusion'])

    def test_missing_params_default(self):
        # Empty dict should fallback to all zeros and not crash
        res = generate_plain_explainer({}, 'json')
        self.assertIn("0 小时", res['summary'])
        self.assertIn("0.00 元", res['summary'])
        self.assertIn("0.00 元", res['details'][0])
        self.assertIn("0%", res['details'][1])
        self.assertIn("0.00 元", res['details'][1])
        self.assertIn("0%", res['details'][2])
        self.assertIn("0.00 元", res['details'][2])
        self.assertIn("0.00 元", res['conclusion'])

        # None should also work due to zero configuration
        res_none = generate_plain_explainer(None, None)
        self.assertEqual(res, res_none)

    def test_dirty_data_self_healing(self):
        data = {
            'total_hours': "100", # string instead of float
            'total_base_cost': -500, # negative value
            'management_fee_rate': math.nan, # NaN
            'management_fee': math.inf, # Inf
            'tax_rate': "abc", # Unparseable string
            'tax': 100.5, # valid
            'subtotal': None, # None
            'grand_total': 0.0 # Will trigger self-healing calculation if > 0 values exist
        }
        res = generate_plain_explainer(data, 'json')
        self.assertIn("100 小时", res['summary'])

        # total_base_cost negative heals to 0
        self.assertIn("0.00 元", res['details'][0])
        # management_fee_rate NaN heals to 0
        self.assertIn("0%", res['details'][1])
        # management_fee inf heals to 0
        self.assertIn("0.00 元", res['details'][1])
        # tax_rate string heals to 0
        self.assertIn("0%", res['details'][2])
        # tax valid is 100.5
        self.assertIn("100.50 元", res['details'][2])

        # Self healed grand_total = 0 (base) + 0 (mgm) + 100.5 (tax) = 100.50
        self.assertIn("100.50 元", res['conclusion'])

    def test_formats_output(self):
        data = {
            'total_hours': 100,
            'total_base_cost': 1000,
            'management_fee_rate': 0.1,
            'management_fee': 100,
            'tax_rate': 0.05,
            'tax': 55,
            'subtotal': 1100,
            'grand_total': 1155
        }

        # Markdown
        md = generate_plain_explainer(data, 'MARKDOWN ') # Also tests format string clean up
        self.assertTrue(md.startswith("# 本月结算确认单（大白话版）"))
        self.assertIn("**本月一共为您提供了 100 小时的服务。需要您支付的总费用为 1155.00 元。**", md)
        self.assertIn("- 1. 基础服务费（按工时算）：1000.00 元", md)
        self.assertIn("> **以上加起来，总共 1155.00 元，一分不差。**", md)

        # HTML
        html = generate_plain_explainer(data, 'htML')
        self.assertTrue(html.startswith('<div class="bill-summary-card"'))
        self.assertIn('<h2 style="color: #333; margin-top: 0;">本月结算确认单（大白话版）</h2>', html)
        self.assertIn('<li>1. 基础服务费（按工时算）：1000.00 元</li>', html)
        self.assertIn('<strong>以上加起来，总共 1155.00 元，一分不差。</strong>', html)

        # Invalid format falls back to JSON
        invalid_fmt = generate_plain_explainer(data, 'xml')
        self.assertIsInstance(invalid_fmt, dict)

    def test_extreme_boundary(self):
        # Huge numbers
        data = {
            'total_hours': 1e10,
            'total_base_cost': 1e15,
            'management_fee_rate': 0.05,
            'management_fee': 5e13,
            'tax_rate': 0.06,
            'tax': 6.3e13,
            'subtotal': 1.05e15,
            'grand_total': 1.113e15
        }
        res = generate_plain_explainer(data, 'json')
        self.assertIn(f"{1e10:g} 小时", res['summary'])
        self.assertIn(f"{1.113e15:.2f} 元", res['summary'])

if __name__ == '__main__':
    unittest.main()
