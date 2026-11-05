import unittest
from ultra_modules.BankBatchTransferFormatter_integration_bridge import validate_luhn, discover_schema_mapping, format_integrated_bank_transfer

class TestBankBatchTransferFormatterIntegrationBridge(unittest.TestCase):

    def test_validate_luhn_extreme_boundaries(self):
        # 边界情况：正常、错误校验位、带空格横线、空值、非法字符
        self.assertTrue(validate_luhn("79927398713"))
        self.assertFalse(validate_luhn("79927398714"))
        self.assertTrue(validate_luhn(" 7992 7398 713 "))
        self.assertFalse(validate_luhn(""))
        self.assertFalse(validate_luhn(" "))
        self.assertFalse(validate_luhn("abcd"))
        self.assertFalse(validate_luhn("7992739871a"))

    def test_schema_mapping_normal_and_dirty_keys(self):
        # 测试脏数据自我修复与不同版本 schema 静默映射
        record1 = {"姓名": "张三", "银行卡号": "79927398713", "实发工资": "1000", "备注信息": "年终奖"}
        mapping1 = discover_schema_mapping(record1)
        self.assertEqual(mapping1['account_name'], "张三")
        self.assertEqual(mapping1['account_number'], "79927398713")
        self.assertEqual(mapping1['amount'], "1000")
        self.assertEqual(mapping1['remark'], "年终奖")

        record2 = {"EMPLOYEE_NAME": "Alice", "card": "79927398713", "pay": 2000}
        mapping2 = discover_schema_mapping(record2)
        self.assertEqual(mapping2['account_name'], "Alice")
        self.assertEqual(mapping2['account_number'], "79927398713")
        self.assertEqual(mapping2['amount'], 2000)
        self.assertIsNone(mapping2['remark'])

    def test_missing_parameters_fallback(self):
        # 测试缺参默认兜底（bank_type 错误，remark 缺参等）
        records = [
            {"name": "Bob", "card_number": "7992 7398 713", "amount": 3000.5}
        ]
        res = format_integrated_bank_transfer(records, bank_type="UNKNOWN_BANK")

        self.assertEqual(res["summary"]["bank_type"], "CMB")
        self.assertEqual(res["summary"]["success_count"], 1)

        success_rec = res["success_records"][0]
        self.assertEqual(success_rec["remark"], "Salary")
        self.assertEqual(success_rec["account_number"], "79927398713")
        self.assertEqual(success_rec["amount"], 3000.5)
        self.assertEqual(success_rec["cmb_biz_type"], "SALARY")

    def test_format_integrated_dirty_data_healing(self):
        # 测试金额格式脏数据自愈（带符号、千分位等）
        records = [
            {"account_name": "Charlie", "account_number": "7992-7398-713", "money": "¥ 1,500.25"},
            {"户名": "David", "账号": "79927398713", "金额": "￥2000.00", "用途": "劳务费"}
        ]
        res = format_integrated_bank_transfer(records, bank_type="ICBC")

        self.assertEqual(res["summary"]["success_count"], 2)
        self.assertEqual(res["summary"]["bank_type"], "ICBC")
        self.assertEqual(res["summary"]["total_amount"], 3500.25)

        self.assertEqual(res["success_records"][0]["amount"], 1500.25)
        self.assertEqual(res["success_records"][1]["amount"], 2000.00)
        self.assertEqual(res["success_records"][0]["remark"], "Salary")
        self.assertEqual(res["success_records"][1]["remark"], "劳务费")
        self.assertEqual(res["success_records"][0]["icbc_pay_code"], "0001")

    def test_extreme_edge_cases_failed_records(self):
        # 测试各种异常边界数据导致的失败
        records = [
            # 无效卡号（Luhn未通过）
            {"name": "Eve", "card_number": "79927398714", "amount": 1000},
            # 缺失姓名
            {"card_number": "79927398713", "amount": 1000},
            # 金额无效
            {"name": "Frank", "card_number": "79927398713", "amount": "invalid"},
            # 金额为负
            {"name": "Grace", "card_number": "79927398713", "amount": -500},
            # 非字典记录
            "not a dict",
            # 缺失金额
            {"name": "Henry", "card_number": "79927398713"}
        ]

        res = format_integrated_bank_transfer(records, bank_type="CCB")
        self.assertEqual(res["summary"]["success_count"], 0)
        self.assertEqual(res["summary"]["failed_count"], 6)

        errors = [r["error"] for r in res["failed_records"]]
        self.assertIn("Invalid card number (Luhn check failed)", errors[0])
        self.assertIn("Missing account name", errors[1])
        self.assertIn("Invalid amount format", errors[2])
        self.assertIn("Invalid amount format", errors[3])
        self.assertIn("Record is not a dictionary", errors[4])
        self.assertIn("Invalid amount format", errors[5])

if __name__ == '__main__':
    unittest.main()
