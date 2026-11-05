import unittest
import time
from ultra_modules.ClientBillSummaryGenerator_batch_pipeline import ClientBillSummaryGenerator

class TestClientBillSummaryGeneratorBatchPipeline(unittest.TestCase):
    def setUp(self):
        self.generator = ClientBillSummaryGenerator(max_workers=5)

    def tearDown(self):
        self.generator.shutdown()

    def test_normal_operation(self):
        """1. 正常操作，带有典型数据"""
        records = [
            {"client": "Client A", "hours": 100, "rate": 20, "mgmt_fee_rate": 0.05, "tax_rate": 0.06},
            {"client": "Client B", "hours": 50, "rate": 30, "mgmt_fee_rate": 0.05, "tax_rate": 0.06},
            {"client": "Client A", "hours": 50, "rate": 20, "mgmt_fee_rate": 0.05, "tax_rate": 0.06},
        ]

        self.generator.process_batch(records)
        self.generator.wait_completion()

        snapshot = self.generator.get_snapshot()

        self.assertTrue(snapshot["is_completed"])
        self.assertEqual(snapshot["total_submitted"], 3)
        self.assertEqual(snapshot["processed"], 3)
        self.assertEqual(snapshot["success"], 3)
        self.assertEqual(snapshot["failure"], 0)

        # Client A validation
        client_a = snapshot["client_summaries"]["Client A"]
        self.assertEqual(client_a["record_count"], 2)
        self.assertEqual(client_a["total_hours"], 150)
        self.assertAlmostEqual(client_a["total_wage"], 3000)
        self.assertAlmostEqual(client_a["total_mgmt_fee"], 150)
        self.assertAlmostEqual(client_a["total_tax"], (3000 + 150) * 0.06)

        # Client B validation
        client_b = snapshot["client_summaries"]["Client B"]
        self.assertEqual(client_b["record_count"], 1)
        self.assertEqual(client_b["total_hours"], 50)
        self.assertAlmostEqual(client_b["total_wage"], 1500)

    def test_dirty_data_healing(self):
        """2. 脏数据自愈：非数字、空字符串、不可转换类型"""
        records = [
            {"client": "  Dirty Client  ", "hours": "not_a_num", "rate": "20.5", "mgmt_fee_rate": None, "tax_rate": ""},
            {"client": None, "hours": [10], "rate": {"a": 1}},
        ]

        self.generator.process_batch(records)
        self.generator.wait_completion()

        snapshot = self.generator.get_snapshot()
        self.assertEqual(snapshot["processed"], 2)
        self.assertEqual(snapshot["success"], 2) # They shouldn't fail, they should heal

        dirty_client = snapshot["client_summaries"]["Dirty Client"]
        self.assertEqual(dirty_client["total_hours"], 0)
        self.assertEqual(dirty_client["total_wage"], 0)
        # tax_rate defaults to 0.06, mgmt to 0.05

        unknown_client = snapshot["client_summaries"]["Unknown Client"]
        self.assertEqual(unknown_client["total_hours"], 0)
        self.assertEqual(unknown_client["total_wage"], 0)

    def test_missing_params_fallback(self):
        """3. 缺参默认兜底：缺少工时、费率等"""
        records = [
            {"client": "Fallback Client", "hours": 100, "rate": 10}, # missing mgmt and tax
            {"client": "Fallback Client"}, # missing everything
        ]

        self.generator.process_batch(records)
        self.generator.wait_completion()

        snapshot = self.generator.get_snapshot()
        self.assertEqual(snapshot["success"], 2)

        client_summary = snapshot["client_summaries"]["Fallback Client"]
        self.assertEqual(client_summary["total_hours"], 100)

        # record 1 total = 100*10 = 1000 wage, mgmt=50, tax=(1000+50)*0.06=63
        self.assertAlmostEqual(client_summary["total_wage"], 1000)
        self.assertAlmostEqual(client_summary["total_mgmt_fee"], 50)
        self.assertAlmostEqual(client_summary["total_tax"], 63)
        self.assertAlmostEqual(client_summary["total_amount"], 1113)

    def test_extreme_boundaries(self):
        """4. 极端边界：空列表，超大数值"""
        self.generator.process_batch([])
        snapshot = self.generator.get_snapshot()
        self.assertTrue(snapshot["is_completed"])
        self.assertEqual(snapshot["total_submitted"], 0)

        large_records = [
            {"client": "Large", "hours": 1e10, "rate": 1e10},
        ]
        self.generator.process_batch(large_records)
        self.generator.wait_completion()

        snapshot = self.generator.get_snapshot()
        self.assertEqual(snapshot["processed"], 1)
        large_client = snapshot["client_summaries"]["Large"]
        self.assertEqual(large_client["total_wage"], 1e20)
        self.assertEqual(large_client["total_mgmt_fee"], 1e20 * 0.05)

    def test_high_throughput(self):
        """5. 高吞吐测试与进度快照：1000条记录"""
        records = [{"client": f"Client_{i % 10}", "hours": 10, "rate": 15} for i in range(1000)]

        # Create a new generator with higher workers for this test specifically
        generator = ClientBillSummaryGenerator(max_workers=50)
        generator.process_batch(records)

        # Get snapshot while it might be running
        snapshot = generator.get_snapshot()
        self.assertIn("total_submitted", snapshot)
        self.assertEqual(snapshot["total_submitted"], 1000)

        generator.wait_completion()

        snapshot = generator.get_snapshot()
        self.assertEqual(snapshot["processed"], 1000)
        self.assertEqual(snapshot["success"], 1000)
        self.assertTrue(snapshot["is_completed"])

        # We expect 10 clients, each with 100 records
        self.assertEqual(len(snapshot["client_summaries"]), 10)
        for i in range(10):
            client = f"Client_{i}"
            summary = snapshot["client_summaries"][client]
            self.assertEqual(summary["record_count"], 100)
            self.assertEqual(summary["total_hours"], 1000) # 100 * 10
            self.assertEqual(summary["total_wage"], 15000) # 100 * 150

        generator.shutdown()

if __name__ == '__main__':
    unittest.main()
