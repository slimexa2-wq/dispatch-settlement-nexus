import unittest
from ultra_modules.ClientBillSummaryGenerator_anomaly_radar import ClientBillSummaryGenerator

class TestClientBillSummaryGeneratorAnomalyRadar(unittest.TestCase):
    def setUp(self):
        self.generator = ClientBillSummaryGenerator()

    def test_01_normal_case_silent_pass(self):
        """测试1：正常数据静默通过，且正确计算费用"""
        # 构建 100 条正常数据，数值一样或极度接近，不会产生异常
        raw_items = [
            {
                "employee_id": f"EMP-{i}",
                "employee_name": f"员工-{i}",
                "work_hours": 160,
                "hourly_rate": 20,
                "management_fee": 100,
                "tax_rate": 0.05
            }
            for i in range(100)
        ]

        result = self.generator.generate(raw_items)
        items = result["items"]

        self.assertEqual(len(items), 100)
        # (160*20 + 100) * (1 + 0.05) = 3300 * 1.05 = 3465
        # (160 * 20) = 3200 (work amount)
        # tax = (3200 + 100) * 0.05 = 165
        # total = 3200 + 100 + 165 = 3465
        self.assertEqual(items[0]["total_amount"], 3465.0)

        # 因为所有数据一样，没有异常偏差，全部应该为 GREEN
        green_count = sum(1 for item in items if item["status_color"] == "GREEN")
        self.assertEqual(green_count, 100)

    def test_02_detect_top_3_percent_anomaly(self):
        """测试2：Top 3%异常红黄报警标记"""
        # 构建 100 条数据，其中3条数值特别大
        raw_items = [
            {
                "employee_id": f"EMP-{i}",
                "employee_name": f"员工-{i}",
                "work_hours": 160,
                "hourly_rate": 20,
                "management_fee": 100,
                "tax_rate": 0.05
            }
            for i in range(97)
        ]

        # 增加3条异常（特别大）
        raw_items.extend([
            {"employee_id": "EMP-97", "work_hours": 300, "hourly_rate": 50, "management_fee": 500, "tax_rate": 0.1},
            {"employee_id": "EMP-98", "work_hours": 350, "hourly_rate": 50, "management_fee": 500, "tax_rate": 0.1},
            {"employee_id": "EMP-99", "work_hours": 400, "hourly_rate": 50, "management_fee": 500, "tax_rate": 0.1},
        ])

        result = self.generator.generate(raw_items)
        items = result["items"]

        red_yellow_count = sum(1 for item in items if item["status_color"] in ["RED", "YELLOW"])
        green_count = sum(1 for item in items if item["status_color"] == "GREEN")

        # 3% of 100 = 3
        self.assertEqual(red_yellow_count, 3)
        self.assertEqual(green_count, 97)

        # 验证大白话原因
        anomalies = [item for item in items if item["status_color"] in ["RED", "YELLOW"]]
        for anomaly in anomalies:
            self.assertIn("偏高", anomaly["anomaly_reason"])
            self.assertIn("大白话说明", anomaly["anomaly_reason"])

    def test_03_dirty_data_self_healing(self):
        """测试3：脏数据自愈（负数、字符串、空值）"""
        raw_items = [
            {
                "employee_id": "EMP-A",
                "work_hours": "-160",   # 负数字符串，应转为正浮点
                "hourly_rate": "20.5",
                "management_fee": "abc",# 无法解析的字符串，应置0
                "tax_rate": 5           # 大于1，应变为 0.05
            }
        ]

        result = self.generator.generate(raw_items)
        item = result["items"][0]

        self.assertEqual(item["work_hours"], 160.0)
        self.assertEqual(item["hourly_rate"], 20.5)
        self.assertEqual(item["management_fee"], 0.0)
        self.assertEqual(item["tax_rate"], 0.05)

        expected_total = (160 * 20.5 + 0.0) * 1.05
        self.assertAlmostEqual(item["total_amount"], expected_total)

    def test_04_missing_parameters_fallback(self):
        """测试4：缺参默认兜底测试"""
        raw_items = [
            {}, # 空字典
            {"employee_id": None, "work_hours": None}
        ]

        result = self.generator.generate(raw_items)
        items = result["items"]

        self.assertEqual(len(items), 2)
        for item in items:
            self.assertEqual(item["work_hours"], 0.0)
            self.assertEqual(item["hourly_rate"], 0.0)
            self.assertEqual(item["total_amount"], 0.0)
            self.assertIn("EMP-UNKNOWN", item["employee_id"])

    def test_05_extreme_boundary_empty_and_small(self):
        """测试5：极端边界，空数据或极小数据量不崩溃"""
        # 测试空列表
        result_empty = self.generator.generate([])
        self.assertEqual(len(result_empty["items"]), 0)

        # 测试单条数据
        result_single = self.generator.generate([
            {"work_hours": 100, "hourly_rate": 10}
        ])
        self.assertEqual(len(result_single["items"]), 1)
        self.assertEqual(result_single["items"][0]["status_color"], "GREEN")

        # 测试两条数据，不抛出 statistics 异常
        result_two = self.generator.generate([
            {"work_hours": 100, "hourly_rate": 10},
            {"work_hours": 1000, "hourly_rate": 100} # 此条会变为红/黄，因为只有两条数据，1条占50% > 3%，取上取整后可以标1条
        ])

        self.assertEqual(len(result_two["items"]), 2)
        # target_count = ceil(2 * 0.03) = 1
        # 所以只有1条会被标记为 RED
        colored_count = sum(1 for x in result_two["items"] if x["status_color"] in ["RED", "YELLOW"])
        self.assertEqual(colored_count, 1)

if __name__ == '__main__':
    unittest.main()
