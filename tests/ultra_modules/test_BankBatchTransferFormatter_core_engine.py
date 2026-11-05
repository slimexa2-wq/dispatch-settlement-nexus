import unittest
from ultra_modules.BankBatchTransferFormatter_core_engine import validate_luhn, format_bank_batch_transfer

class TestBankBatchTransferFormatter(unittest.TestCase):
    def test_validate_luhn(self):
        # Normal
        self.assertTrue(validate_luhn("79927398713"))
        # Invalid checksum
        self.assertFalse(validate_luhn("79927398714"))
        # With spaces
        self.assertTrue(validate_luhn(" 79927398713 "))
        # Empty and invalid chars
        self.assertFalse(validate_luhn(""))
        self.assertFalse(validate_luhn("abc"))

    def test_invalid_input(self):
        # Test non-list input
        res = format_bank_batch_transfer(None)
        self.assertEqual(res, {"error": "Invalid input: records must be a list"})

    def test_normal_records(self):
        # 正常数据，不同银行
        records = [
            {"name": "Alice", "card_number": "79927398713", "amount": 1000.5},
            {"account_name": "Bob", "account_number": " 79927398713 ", "money": "2,000.50", "remark": "Bonus"}
        ]

        # Test CMB (default)
        res = format_bank_batch_transfer(records)
        self.assertEqual(res["summary"]["success_count"], 2)
        self.assertEqual(res["summary"]["failed_count"], 0)
        self.assertEqual(res["summary"]["total_amount"], 3001.0)
        self.assertEqual(res["summary"]["bank_type"], "CMB")
        self.assertEqual(res["success_records"][0]["cmb_biz_type"], "SALARY")
        self.assertEqual(res["success_records"][1]["remark"], "Bonus")

        # Test ICBC
        res_icbc = format_bank_batch_transfer(records, bank_type="ICBC")
        self.assertEqual(res_icbc["summary"]["bank_type"], "ICBC")
        self.assertEqual(res_icbc["success_records"][0]["icbc_pay_code"], "0001")

        # Test CCB
        res_ccb = format_bank_batch_transfer(records, bank_type="CCB")
        self.assertEqual(res_ccb["summary"]["bank_type"], "CCB")
        self.assertEqual(res_ccb["success_records"][0]["ccb_flag"], "1")

    def test_dirty_data_auto_healing(self):
        # 脏数据静默清洗、缺参赋默认值
        records = [
            # Wrong bank fallback
            {"name": "Alice", "card_number": "79927398713-", "amount": "¥ 1000.0"},
            # Non-dict row should be ignored
            "invalid_row",
            # Missing remark fallback to 'Salary'
            {"account_name": "Bob", "account_number": "7992 7398 713", "money": 2000, "remark": ""}
        ]
        res = format_bank_batch_transfer(records, bank_type="XYZ")
        self.assertEqual(res["summary"]["bank_type"], "CMB") # Fallback to CMB
        self.assertEqual(res["summary"]["success_count"], 2)

        rec1 = res["success_records"][0]
        self.assertEqual(rec1["account_number"], "79927398713")
        self.assertEqual(rec1["amount"], 1000.0)
        self.assertEqual(rec1["remark"], "Salary")

        rec2 = res["success_records"][1]
        self.assertEqual(rec2["account_number"], "79927398713")
        self.assertEqual(rec2["remark"], "Salary")

    def test_failed_records_boundaries(self):
        # 测试异常边界条件导致失败的记录
        records = [
            # Invalid Luhn
            {"name": "Alice", "card_number": "79927398714", "amount": 1000},
            # Missing name
            {"name": " ", "card_number": "79927398713", "amount": 1000},
            # Invalid amount string
            {"name": "Bob", "card_number": "79927398713", "amount": "invalid"},
            # Negative amount
            {"name": "Bob", "card_number": "79927398713", "amount": -100},
            # Zero amount
            {"name": "Bob", "card_number": "79927398713", "amount": 0},
            # Invalid amount type
            {"name": "Bob", "card_number": "79927398713", "amount": []}
        ]
        res = format_bank_batch_transfer(records)
        self.assertEqual(res["summary"]["success_count"], 0)
        self.assertEqual(res["summary"]["failed_count"], 6)

        errors = [r["error"] for r in res["failed_records"]]
        self.assertIn("Invalid card number (Luhn check failed)", errors[0])
        self.assertIn("Missing account name", errors[1])
        self.assertIn("Invalid amount format", errors[2])
        self.assertIn("Invalid amount format", errors[3])
        self.assertIn("Invalid amount format", errors[4])
        self.assertIn("Invalid amount format", errors[5])

if __name__ == '__main__':
    unittest.main()
