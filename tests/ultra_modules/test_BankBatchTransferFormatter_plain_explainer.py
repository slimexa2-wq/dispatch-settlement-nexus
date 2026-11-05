import unittest
import json
from ultra_modules.BankBatchTransferFormatter_plain_explainer import BankBatchTransferFormatter

class TestBankBatchTransferFormatter(unittest.TestCase):

    def test_normal_functionality_and_luhn(self):
        # Normal case with a valid Luhn number
        records = [
            {"name": "张三", "card_number": "79927398713", "amount": 1000.50},
            {"name": "李四", "card_number": "79927398714", "amount": 2000.00}, # Invalid Luhn
        ]
        formatter = BankBatchTransferFormatter(records, bank_name="招商银行")

        # Luhn check for 张三 should be True
        self.assertTrue(formatter.records[0]["is_luhn_valid"])
        # Luhn check for 李四 should be False
        self.assertFalse(formatter.records[1]["is_luhn_valid"])

        summary = formatter.generate_summary()
        self.assertEqual(summary["total_count"], 2)
        self.assertEqual(summary["valid_count"], 1)
        self.assertEqual(summary["invalid_count"], 1)
        self.assertEqual(summary["total_valid_amount"], 1000.50)
        self.assertEqual(summary["bank_name"], "招商银行")

    def test_dirty_data_self_healing(self):
        # Dirty data: strings in amounts, non-digits in card number
        records = [
            {"name": "王五", "card_number": " 79 9273-98713! ", "amount": "3000.75"},
            {"name": "  赵六  ", "card_number": "abc", "amount": "invalid_amount"}
        ]
        formatter = BankBatchTransferFormatter(records)

        # Self-healing checks
        self.assertEqual(formatter.records[0]["card_number"], "79927398713")
        self.assertTrue(formatter.records[0]["is_luhn_valid"])
        self.assertEqual(formatter.records[0]["amount"], 3000.75)
        self.assertEqual(formatter.records[0]["name"], "王五")

        self.assertEqual(formatter.records[1]["card_number"], "")
        self.assertFalse(formatter.records[1]["is_luhn_valid"])
        self.assertEqual(formatter.records[1]["amount"], 0.0)
        self.assertEqual(formatter.records[1]["name"], "赵六")

    def test_missing_params_fallback(self):
        # Missing parameters fallback to defaults
        formatter = BankBatchTransferFormatter() # No params
        summary = formatter.generate_summary()

        self.assertEqual(summary["bank_name"], "通用银行")
        self.assertEqual(summary["total_count"], 0)
        self.assertEqual(summary["valid_count"], 0)
        self.assertEqual(summary["invalid_count"], 0)

        records = [
            {"card_number": "79927398713"} # Missing name and amount
        ]
        formatter2 = BankBatchTransferFormatter(records)
        self.assertEqual(formatter2.records[0]["name"], "未知收款人")
        self.assertEqual(formatter2.records[0]["amount"], 0.0)

    def test_extreme_boundaries(self):
        # Extreme boundaries: negative amount, large amount, non-dict records
        records = [
            {"name": "小明", "card_number": "79927398713", "amount": -500},
            {"name": "小红", "card_number": "79927398713", "amount": 1e10},
            "Not a dict", # Should be ignored
            123 # Should be ignored
        ]
        formatter = BankBatchTransferFormatter(records)

        # Negative amount -> 0.0
        self.assertEqual(formatter.records[0]["amount"], 0.0)
        # Large amount -> accepted
        self.assertEqual(formatter.records[1]["amount"], 1e10)
        # Non-dict ignored
        self.assertEqual(len(formatter.records), 2)

    def test_output_formats(self):
        records = [
            {"name": "测试人", "card_number": "79927398713", "amount": 100},
            {"name": "异常人", "card_number": "123", "amount": 200},
        ]
        formatter = BankBatchTransferFormatter(records, bank_name="建设银行")

        json_out = formatter.to_json()
        md_out = formatter.to_markdown()
        html_out = formatter.to_html()

        # Simple string inclusion assertions
        self.assertIn("建设银行", json_out)
        self.assertIn("测试人", json_out)

        self.assertIn("## 建设银行 代发工资业务摘要", md_out)
        self.assertIn("异常卡号提醒", md_out)

        self.assertIn("<h2>建设银行 代发工资业务摘要</h2>", html_out)
        self.assertIn("异常卡号提醒", html_out)
        self.assertIn("color:red", html_out)

if __name__ == '__main__':
    unittest.main()
