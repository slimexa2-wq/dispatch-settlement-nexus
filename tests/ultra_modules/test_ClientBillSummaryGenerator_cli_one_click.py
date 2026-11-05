import unittest
import os
import json
import csv
from decimal import Decimal
from ultra_modules.ClientBillSummaryGenerator_cli_one_click import ClientBillSummaryGenerator

class TestClientBillSummaryGenerator(unittest.TestCase):
    def setUp(self):
        self.output_dir = "tests/test_output"
        os.makedirs(self.output_dir, exist_ok=True)
        self.json_path = os.path.join(self.output_dir, "client_bill_summary.json")
        self.csv_path = os.path.join(self.output_dir, "client_bill_summary.csv")

    def tearDown(self):
        if os.path.exists(self.json_path):
            os.remove(self.json_path)
        if os.path.exists(self.csv_path):
            os.remove(self.csv_path)
        if os.path.exists(self.output_dir):
            try:
                os.rmdir(self.output_dir)
            except OSError:
                pass

        # Clean up files in root if run zero-config
        if os.path.exists("client_bill_summary.json"):
            os.remove("client_bill_summary.json")
        if os.path.exists("client_bill_summary.csv"):
            os.remove("client_bill_summary.csv")

    def test_1_normal_dataset(self):
        """测试正常数据计算"""
        data = [{
            "employee_name": "Test1",
            "working_hours": 100,
            "hourly_rate": 50,
            "management_fee_rate": 0.1,
            "tax_rate": 0.05,
            "return_fee": 100,
            "recruitment_commission": 200
        }]
        generator = ClientBillSummaryGenerator(data=data, output_dir=self.output_dir)
        generator.process()

        detail = generator.processed_data[0]
        # Base fee = 100 * 50 = 5000
        self.assertEqual(detail["base_fee"], 5000.0)
        # Mgmt fee = 5000 * 0.1 = 500
        self.assertEqual(detail["management_fee"], 500.0)
        # Tax fee = (5000 + 500) * 0.05 = 275
        self.assertEqual(detail["tax_fee"], 275.0)
        # Total = 5000 + 500 + 275 = 5775
        self.assertEqual(detail["total"], 5775.0)
        # Net gross margin = 5775 - (5000 + 100 + 200) = 475
        self.assertEqual(detail["net_gross_margin"], 475.0)

    def test_2_missing_parameter_fallback(self):
        """测试缺省参数及零配置调用"""
        # 不传 data，直接初始化
        generator = ClientBillSummaryGenerator(output_dir=self.output_dir)
        result = generator.generate()

        self.assertEqual(result["status"], "success")
        self.assertTrue(os.path.exists(self.json_path))
        self.assertTrue(os.path.exists(self.csv_path))

        # 验证缺省兜底数据条数
        self.assertEqual(result["summary"]["total_employees"], 3)

        # 王五缺失一堆数据，验证兜底率（10% management, 6% tax, 0 fees）
        wangwu = [d for d in generator.processed_data if d["employee_name"] == "王五"][0]
        self.assertEqual(wangwu["working_hours"], 0.0) # None fallback to 0
        self.assertEqual(wangwu["management_fee"], 0.0)

    def test_3_dirty_data_self_healing(self):
        """测试脏数据自愈（字符串、负数、无效格式等）"""
        data = [{
            "employee_name": "TestDirty",
            "working_hours": "-50", # Negative -> 0
            "hourly_rate": "invalid_string", # Invalid -> 0
            "management_fee_rate": "0.15", # String convert
            "tax_rate": None, # None -> default 0.06 inside processing
            "return_fee": "20.5", # String
        }]
        generator = ClientBillSummaryGenerator(data=data, output_dir=self.output_dir)
        generator.process()

        detail = generator.processed_data[0]
        self.assertEqual(detail["working_hours"], 0.0)
        self.assertEqual(detail["base_fee"], 0.0)
        self.assertEqual(detail["return_fee"], 20.5)

    def test_4_extreme_edge_cases_and_rounding(self):
        """测试极端边缘数据及精度四舍五入"""
        data = [{
            "employee_name": "EdgeCase",
            "working_hours": 160.333,
            "hourly_rate": 55.555,
            "management_fee_rate": 0.123,
            "tax_rate": 0.065,
            "return_fee": 0,
            "recruitment_commission": 0
        }]
        generator = ClientBillSummaryGenerator(data=data, output_dir=self.output_dir)
        generator.process()

        detail = generator.processed_data[0]

        # Base fee = 160.333 * 55.555 = 8907.299815 -> 8907.30
        self.assertEqual(detail["base_fee"], 8907.30)

        # Mgmt fee = 8907.30 * 0.123 = 1095.5979 -> 1095.60
        self.assertEqual(detail["management_fee"], 1095.60)

        # Tax fee = (8907.30 + 1095.60) * 0.065 = 10002.90 * 0.065 = 650.1885 -> 650.19
        self.assertEqual(detail["tax_fee"], 650.19)

        # Total = 8907.30 + 1095.60 + 650.19 = 10653.09
        self.assertEqual(detail["total"], 10653.09)

    def test_5_dual_mode_file_generation(self):
        """测试双模输出（JSON和CSV格式）内容有效性"""
        generator = ClientBillSummaryGenerator(output_dir=self.output_dir)
        generator.generate()

        # JSON validation
        with open(self.json_path, 'r', encoding='utf-8') as f:
            json_data = json.load(f)
            self.assertIn("summary", json_data)
            self.assertIn("details", json_data)
            self.assertEqual(len(json_data["details"]), 3)

        # CSV validation
        with open(self.csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f)
            rows = list(reader)
            # Headers + 3 records + empty line + summary row 1 + summary row 2 = 7 lines
            self.assertEqual(len(rows), 7)
            self.assertEqual(rows[0][0], "员工姓名")
            self.assertEqual(rows[1][0], "张三")

if __name__ == '__main__':
    unittest.main()
