import unittest
from ultra_modules.social_security_prorater_anomaly_radar import SocialSecurityProraterAnomalyRadar

class TestSocialSecurityProraterAnomalyRadar(unittest.TestCase):
    def setUp(self):
        self.radar = SocialSecurityProraterAnomalyRadar()

    def test_01_normal_operation(self):
        """测试正常业务场景，包含缺省样本不足时的全绿放行"""
        records = [
            {"id": 1, "name": "张三", "base_salary": 10000, "min_cap": 3000, "max_cap": 15000, "month_days": 21.75, "worked_days": 21.75},
            {"id": 2, "name": "李四", "base_salary": 10000, "min_cap": 3000, "max_cap": 15000, "month_days": 21.75, "worked_days": 10.875},
            {"id": 3, "name": "王五", "base_salary": 8000, "min_cap": 3000, "max_cap": 15000, "month_days": 21.75, "worked_days": 21.75},
        ]
        result = self.radar.process_batch(records)
        processed = result["processed_records"]

        self.assertEqual(len(processed), 3)
        # 张三满勤
        self.assertEqual(processed[0]["prorated_salary"], 10000.0)
        self.assertEqual(processed[0]["capped_base"], 10000.0)
        # 李四半勤
        self.assertEqual(processed[1]["prorated_salary"], 5000.0)
        self.assertEqual(processed[1]["capped_base"], 5000.0)
        # 王五满勤
        self.assertEqual(processed[2]["prorated_salary"], 8000.0)
        self.assertEqual(processed[2]["capped_base"], 8000.0)

        # 样本<4，全是绿的
        for rec in processed:
            self.assertEqual(rec["anomaly_color"], "Green")

    def test_02_dirty_data_healing_and_missing_params(self):
        """测试脏数据自愈和缺参默认兜底"""
        records = [
            {"id": 1, "base_salary": "￥8,000"}, # 缺 name, min_cap, max_cap, month_days, worked_days
            {"id": 2, "name": "赵六", "base_salary": None, "worked_days": "10.5"}, # base_salary 会 fallback 到 3000
            {"id": 3, "name": "田七", "base_salary": "abc", "month_days": 0}, # base_salary fallback 到 3000， month_days fallback 到 21.75
        ]
        result = self.radar.process_batch(records)
        processed = result["processed_records"]

        # id 1
        self.assertEqual(processed[0]["name"], "匿名员工")
        self.assertEqual(processed[0]["clean_base_salary"], 8000.0)
        self.assertEqual(processed[0]["capped_base"], 8000.0)

        # id 2
        self.assertEqual(processed[1]["clean_base_salary"], 3000.0)
        # 10.5 / 21.75 * 3000 = 1448.2758... capped_base 应该触及最小下限 3000
        self.assertEqual(processed[1]["capped_base"], 3000.0)

        # id 3
        self.assertEqual(processed[2]["clean_base_salary"], 3000.0)
        self.assertEqual(processed[2]["capped_base"], 3000.0)

    def test_03_extreme_boundaries(self):
        """测试极大、极小及边界封顶限制"""
        records = [
            {"id": 1, "name": "A", "base_salary": 999999, "min_cap": 3000, "max_cap": 15000},
            {"id": 2, "name": "B", "base_salary": 1000, "min_cap": 3000, "max_cap": 15000},
            {"id": 3, "name": "C", "base_salary": 20000, "min_cap": 50000, "max_cap": 30000}, # min > max 脏数据修复测试
        ]
        result = self.radar.process_batch(records)
        processed = result["processed_records"]

        # A
        self.assertEqual(processed[0]["capped_base"], 15000.0)
        # B
        self.assertEqual(processed[1]["capped_base"], 3000.0)
        # C, min_cap 和 max_cap 互换
        self.assertEqual(processed[2]["capped_base"], 30000.0)

    def test_04_anomaly_detection_colors(self):
        """测试红、黄、绿三色极简标记器 (Z-Score & IQR)"""
        # 生成正常数据群
        records = [{"id": i, "name": f"员工{i}", "base_salary": 10000} for i in range(100)]
        # 添加轻微偏差数据 (不一定触发红)
        records.append({"id": 101, "name": "黄标员工", "base_salary": 18000})
        # 添加极度异常数据
        records.append({"id": 102, "name": "红标员工1", "base_salary": 9999999})
        records.append({"id": 103, "name": "红标员工2", "base_salary": -999999}) # dirty fallback

        result = self.radar.process_batch(records)
        processed = result["processed_records"]

        red_count = sum(1 for r in processed if r["anomaly_color"] == "Red")
        yellow_count = sum(1 for r in processed if r["anomaly_color"] == "Yellow")
        green_count = sum(1 for r in processed if r["anomaly_color"] == "Green")

        # Top 3% of 103 = 4
        # 实际异常：9999999 触顶 -> max cap=15000
        # -999999 -> fallback -> 0出勤(或3000 base)-> min cap = 3000
        # 18000 触顶 -> max cap=15000
        # 正常 100 人 10000 -> 10000

        # 因为上面的 capped_base 逻辑，我们需要重新设计用例使之偏离，
        # 我们把 capped 放开一点。

        records_custom = [{"id": i, "name": f"员工{i}", "base_salary": 10000, "max_cap": 99999999} for i in range(100)]
        # 极高
        records_custom.append({"id": 101, "name": "特高", "base_salary": 900000, "max_cap": 99999999})
        records_custom.append({"id": 102, "name": "次高", "base_salary": 800000, "max_cap": 99999999})
        # 正常边缘
        records_custom.append({"id": 103, "name": "边缘高", "base_salary": 30000, "max_cap": 99999999})
        records_custom.append({"id": 104, "name": "边缘高2", "base_salary": 31000, "max_cap": 99999999})

        result_custom = self.radar.process_batch(records_custom)
        processed_custom = result_custom["processed_records"]

        red_count = sum(1 for r in processed_custom if r["anomaly_color"] == "Red")
        yellow_count = sum(1 for r in processed_custom if r["anomaly_color"] == "Yellow")

        # Top 3% of 104 = 4. 所以如果有异常，最多有 4 个红色。
        self.assertTrue(red_count <= 4)

        # 特高和次高应该是异常
        high_anomalies = [r for r in processed_custom if r["name"] in ["特高", "次高"]]
        for r in high_anomalies:
            self.assertEqual(r["anomaly_color"], "Red", f"Expected Red but got {r['anomaly_color']}")

        # 边缘高可能黄标或红标，具体看IQR和Z-score计算，此处断言有黄色或红色即可
        edge_anomalies = [r for r in processed_custom if r["name"] in ["边缘高", "边缘高2"]]
        for r in edge_anomalies:
            self.assertTrue(r["anomaly_color"] in ["Yellow", "Red"])

    def test_05_empty_input(self):
        """测试空输入"""
        result = self.radar.process_batch([])
        self.assertEqual(len(result["processed_records"]), 0)
        self.assertTrue(len(result["audit_log"]) > 0)
        self.assertIn("Empty input records", result["audit_log"][0])

if __name__ == '__main__':
    unittest.main()
