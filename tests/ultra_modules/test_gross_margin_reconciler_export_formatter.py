import unittest
import math
import datetime
import csv
import io
from ultra_modules.gross_margin_reconciler_export_formatter import format_gross_margin_export, _safe_float

class TestGrossMarginReconcilerExportFormatter(unittest.TestCase):
    def test_normal_operation(self):
        data = [
            {
                "name": "张三",
                "receivable": 10000.0,
                "payable_equal_pay": 5000.0,
                "payable_return_fee": 1000.0,
                "payable_commission": 500.0
            },
            {
                "name": "李四",
                "receivable": "8000",
                "payable_equal_pay": "4000",
                "payable_return_fee": "800",
                "payable_commission": "400"
            }
        ]
        result = format_gross_margin_export(data, "测试项目", "2023-10-01")

        self.assertIn("csv_content", result)
        self.assertIn("report_summary", result)

        # Check summary
        summary = result["report_summary"]
        self.assertIn("【测试项目】2023-10-01对账单简报", summary)
        self.assertIn("总核算人数：2人", summary)
        self.assertIn("总应收：18000.00元", summary)
        self.assertIn("总应付：11700.00元", summary)
        self.assertIn("最终净毛利：6300.00元", summary)

        # Check CSV
        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(len(rows), 3) # Header + 2 data rows
        self.assertEqual(rows[0], ["姓名", "应收开票", "应付(同工同酬)", "应付(返费)", "应付(自招提成)", "单人净毛利"])
        self.assertEqual(rows[1], ["张三", "10000.00", "5000.00", "1000.00", "500.00", "3500.00"])
        self.assertEqual(rows[2], ["李四", "8000.00", "4000.00", "800.00", "400.00", "2800.00"])

    def test_missing_parameters_fallback(self):
        # Call with no arguments
        result = format_gross_margin_export()

        self.assertIn("csv_content", result)
        self.assertIn("report_summary", result)

        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        summary = result["report_summary"]
        self.assertIn("【未命名项目】", summary)
        self.assertIn(today_str, summary)
        self.assertIn("总核算人数：0人", summary)
        self.assertIn("总应收：0.00元", summary)
        self.assertIn("总应付：0.00元", summary)
        self.assertIn("最终净毛利：0.00元", summary)

        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(len(rows), 1) # Just header

    def test_dirty_data_self_healing(self):
        data = [
            {
                "name": "   ", # empty name should fallback
                "receivable": math.nan,
                "payable_equal_pay": None,
                "payable_return_fee": "invalid",
                "payable_commission": float('inf')
            },
            {
                "name": None,
                "receivable": "100.5",
                # missing other fields
            }
        ]

        result = format_gross_margin_export(data)

        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1], ["未知人员", "0.00", "0.00", "0.00", "0.00", "0.00"])
        self.assertEqual(rows[2], ["未知人员", "100.50", "0.00", "0.00", "0.00", "100.50"])

        summary = result["report_summary"]
        self.assertIn("总应收：100.50元", summary)
        self.assertIn("总应付：0.00元", summary)
        self.assertIn("最终净毛利：100.50元", summary)

    def test_mixed_list_contents(self):
        # Data containing non-dict items
        data = [
            "this is not a dict",
            None,
            123,
            {
                "name": "王五",
                "receivable": 500,
                "payable_equal_pay": 100
            },
            ["list item"]
        ]

        result = format_gross_margin_export(data)

        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(len(rows), 2) # Header + 1 valid dict
        self.assertEqual(rows[1], ["王五", "500.00", "100.00", "0.00", "0.00", "400.00"])

        summary = result["report_summary"]
        self.assertIn("总核算人数：1人", summary)

    def test_extreme_edge_cases(self):
        # Large numbers, negative values
        data = [
            {
                "name": "极值测试",
                "receivable": 1e9, # 1 billion
                "payable_equal_pay": -50000.55, # negative
                "payable_return_fee": 0,
                "payable_commission": 0.001
            }
        ]

        result = format_gross_margin_export(data)

        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)

        self.assertEqual(len(rows), 2)
        # 1e9 - (-50000.55) - 0.00 = 1000050000.55 (0.001 rounds to 0.00 in formatting)
        self.assertEqual(rows[1], ["极值测试", "1000000000.00", "-50000.55", "0.00", "0.00", "1000050000.55"])

    def test_safe_float_coverage(self):
        self.assertEqual(_safe_float(None), 0.0)
        self.assertEqual(_safe_float("invalid"), 0.0)
        self.assertEqual(_safe_float(math.nan), 0.0)
        self.assertEqual(_safe_float(float('inf')), 0.0)
        self.assertEqual(_safe_float([]), 0.0)
        self.assertEqual(_safe_float(100.5), 100.5)
        self.assertEqual(_safe_float("100.5"), 100.5)

if __name__ == '__main__':
    unittest.main()
