import unittest
import uuid
from typing import List, Dict, Any

from ultra_modules.supplier_invoice_vat_checker_anomaly_radar import SupplierInvoiceVatCheckerAnomalyRadar

class TestSupplierInvoiceVatCheckerAnomalyRadar(unittest.TestCase):

    def setUp(self):
        self.radar = SupplierInvoiceVatCheckerAnomalyRadar()

    def test_normal_case_silent_pass(self):
        """测试正常数据是否正确计算抵扣并静默放行（绿标）"""
        invoices = [
            {"id": "inv1", "amount": 1060.0, "vat_rate": 0.06, "invoice_type": "专票"},
            {"id": "inv2", "amount": 1030.0, "vat_rate": 0.03, "invoice_type": "专票"},
            {"id": "inv3", "amount": 1010.0, "vat_rate": 0.01, "invoice_type": "专票"},
            {"id": "inv4", "amount": 1050.0, "vat_rate": 0.05, "invoice_type": "专票"},
            {"id": "inv5", "amount": 1000.0, "vat_rate": 0.00, "invoice_type": "普票"},
        ]

        # 补齐到较多样本以免全部成为异常
        for i in range(30):
            invoices.append({"id": f"inv_norm_{i}", "amount": 1000.0, "vat_rate": 0.0, "invoice_type": "普票"})

        result = self.radar.scan_invoices(invoices)

        self.assertEqual(result["summary"]["total"], 35)
        # 应无任何红色高亮（因为金额集中且税率全合规）
        self.assertEqual(result["summary"]["anomalies"], 0)

        inv1_res = next(r for r in result["results"] if r["id"] == "inv1")
        self.assertEqual(inv1_res["marker"], "green")
        self.assertAlmostEqual(inv1_res["calculated_deduction"], 60.0, places=2)

    def test_dirty_data_self_healing(self):
        """测试脏数据自愈：无效金额、无效税率字符串解析"""
        invoices = [
            {"id": "inv_dirty1", "amount": "invalid", "vat_rate": "3%", "invoice_type": "专票"},
            {"id": "inv_dirty2", "amount": None, "vat_rate": "invalid", "invoice_type": "普票"},
            {"id": "inv_dirty3", "amount": "1060", "vat_rate": "6%", "invoice_type": "专票"},
        ]
        for i in range(30):
            invoices.append({"id": f"inv_norm_{i}", "amount": 1000.0, "vat_rate": 0.0, "invoice_type": "普票"})

        result = self.radar.scan_invoices(invoices)

        inv1_res = next(r for r in result["results"] if r["id"] == "inv_dirty1")
        self.assertEqual(inv1_res["amount"], 0.0)
        self.assertAlmostEqual(inv1_res["vat_rate"], 0.03, places=2)

        inv2_res = next(r for r in result["results"] if r["id"] == "inv_dirty2")
        self.assertEqual(inv2_res["amount"], 0.0)
        self.assertEqual(inv2_res["vat_rate"], 0.0)

        inv3_res = next(r for r in result["results"] if r["id"] == "inv_dirty3")
        self.assertEqual(inv3_res["amount"], 1060.0)
        self.assertAlmostEqual(inv3_res["vat_rate"], 0.06, places=2)
        self.assertAlmostEqual(inv3_res["calculated_deduction"], 60.0, places=2)

        # 审计日志断言
        audit_actions = [log["action"] for log in self.radar.audit_log]
        self.assertIn("dirty_data_healed", audit_actions)

    def test_missing_params_fallback(self):
        """测试缺参情况下的默认兜底：缺id、缺invoice_type"""
        invoices = [
            {"amount": 1000.0, "vat_rate": 0.0}, # 缺 ID 和 invoice_type
        ]
        result = self.radar.scan_invoices(invoices)

        res_list = result["results"]
        self.assertEqual(len(res_list), 1)

        inv = res_list[0]
        self.assertTrue(inv["id"].startswith("auto_"))
        self.assertEqual(inv["invoice_type"], "普票")
        self.assertEqual(inv["calculated_deduction"], 0.0)

    def test_top_3_percent_anomaly(self):
        """测试自动高亮Top3%严重偏离的数据"""
        invoices = []
        # 构建100条数据，3条极大值，其余为1000左右的正常值
        for i in range(97):
            invoices.append({"id": f"inv_{i}", "amount": 1000.0 + (i % 10), "vat_rate": 0.0, "invoice_type": "普票"})

        invoices.append({"id": "anomaly_1", "amount": 999999.0, "vat_rate": 0.0, "invoice_type": "普票"})
        invoices.append({"id": "anomaly_2", "amount": 888888.0, "vat_rate": 0.0, "invoice_type": "普票"})
        invoices.append({"id": "anomaly_3", "amount": 777777.0, "vat_rate": 0.0, "invoice_type": "普票"})

        result = self.radar.scan_invoices(invoices)

        # 100 的 3% 是 3，所以只高亮3条
        self.assertEqual(result["summary"]["anomalies"], 3)

        anomaly_ids = [r["id"] for r in result["results"] if r["is_highlighted"]]
        self.assertIn("anomaly_1", anomaly_ids)
        self.assertIn("anomaly_2", anomaly_ids)
        self.assertIn("anomaly_3", anomaly_ids)

    def test_extreme_boundaries(self):
        """测试极端边界：空列表，仅有一条数据，专票不合规税率拦截"""
        # 空列表
        res_empty = self.radar.scan_invoices([])
        self.assertEqual(res_empty["summary"]["total"], 0)

        # 仅有一条数据
        res_one = self.radar.scan_invoices([
            {"id": "single", "amount": 5000.0, "vat_rate": 0.06, "invoice_type": "专票"}
        ])
        self.assertEqual(res_one["summary"]["total"], 1)
        self.assertEqual(res_one["results"][0]["marker"], "green") # 数据不足无法计算分布异常，只看合规

        # 专票不合规税率 (比如 13% 并非劳务常见，或错填为 17%)
        invoices = []
        for i in range(99):
            invoices.append({"id": f"inv_{i}", "amount": 1000.0, "vat_rate": 0.0, "invoice_type": "普票"})
        invoices.append({"id": "bad_tax", "amount": 1130.0, "vat_rate": 0.13, "invoice_type": "增值税专票"})

        res_bad = self.radar.scan_invoices(invoices)

        bad_res = next(r for r in res_bad["results"] if r["id"] == "bad_tax")
        self.assertTrue(bad_res["is_highlighted"])
        self.assertEqual(bad_res["marker"], "red")
        self.assertIn("不在合规劳务税率", bad_res["reason"])

if __name__ == "__main__":
    unittest.main()
