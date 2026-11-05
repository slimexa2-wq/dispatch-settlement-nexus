import unittest
import time
from typing import List, Dict, Any

from ultra_modules.supplier_invoice_vat_checker_batch_pipeline import SupplierInvoiceVatChecker, BatchPipeline

class TestSupplierInvoiceVatCheckerBatchPipeline(unittest.TestCase):

    def test_normal_case_special_invoice(self):
        """测试正常专票抵扣"""
        record = {'id': '1', 'amount': '106.0', 'invoice_type': '专票', 'vat_rate': '6%'}
        result = SupplierInvoiceVatChecker.process_record(record)

        self.assertTrue(result['is_valid'])
        self.assertEqual(result['applied_invoice_type'], '专票')
        self.assertEqual(result['applied_vat_rate'], '6%')
        self.assertEqual(result['amount_without_tax'], 100.0)
        self.assertEqual(result['tax_amount'], 6.0)
        self.assertEqual(result['deductible_amount'], 6.0) # 专票可全额抵扣税额
        self.assertEqual(len(result['errors']), 0)

    def test_normal_case_general_invoice(self):
        """测试正常普票不能抵扣"""
        record = {'id': '2', 'amount': 103.0, 'invoice_type': '普票', 'vat_rate': 3}
        result = SupplierInvoiceVatChecker.process_record(record)

        self.assertTrue(result['is_valid'])
        self.assertEqual(result['applied_invoice_type'], '普票')
        self.assertEqual(result['applied_vat_rate'], '3%')
        self.assertEqual(result['amount_without_tax'], 100.0)
        self.assertEqual(result['tax_amount'], 3.0)
        self.assertEqual(result['deductible_amount'], 0.0) # 普票不可抵扣
        self.assertEqual(len(result['errors']), 0)

    def test_dirty_data_self_healing(self):
        """测试脏数据自愈（字符串带单位/逗号等）"""
        record = {'id': '3', 'amount': '￥ 1,060.00', 'invoice_type': ' 专票 ', 'vat_rate': ' 6 % '}
        result = SupplierInvoiceVatChecker.process_record(record)

        self.assertTrue(result['is_valid'])
        self.assertEqual(result['applied_invoice_type'], '专票')
        self.assertEqual(result['applied_vat_rate'], '6%')
        self.assertEqual(result['amount_without_tax'], 1000.0)
        self.assertEqual(result['tax_amount'], 60.0)
        self.assertEqual(result['deductible_amount'], 60.0)

    def test_missing_params_fallback(self):
        """测试缺参默认兜底"""
        record = {'id': '4'} # 缺amount, invoice_type, vat_rate
        result = SupplierInvoiceVatChecker.process_record(record)

        self.assertTrue(result['is_valid'])
        self.assertEqual(result['applied_invoice_type'], '普票') # 默认普票
        self.assertEqual(result['applied_vat_rate'], '6%') # 默认6%
        self.assertEqual(result['amount_without_tax'], 0.0) # 默认0
        self.assertEqual(result['tax_amount'], 0.0)
        self.assertEqual(result['deductible_amount'], 0.0)
        self.assertTrue(len(result['errors']) > 0) # 应该有报错记录

    def test_extreme_edge_cases(self):
        """测试极端边界：负数金额，非法税率等"""
        record = {'id': '5', 'amount': -100.0, 'invoice_type': '收据', 'vat_rate': '99%'}
        result = SupplierInvoiceVatChecker.process_record(record)

        self.assertFalse(result['is_valid']) # 负数金额导致非法
        self.assertEqual(result['applied_invoice_type'], '普票') # 非法类型 fallback 到普票
        self.assertEqual(result['applied_vat_rate'], '6%') # 非法税率 fallback 到 6%
        self.assertEqual(result['amount_without_tax'], 0.0)
        self.assertEqual(result['tax_amount'], 0.0)
        self.assertEqual(result['deductible_amount'], 0.0)
        self.assertTrue(len(result['errors']) >= 3)

    def test_batch_pipeline_concurrent(self):
        """测试高吞吐批量流水线与并发加速封装"""
        pipeline = BatchPipeline(max_workers=5)

        records = [
            {'id': f'id_{i}', 'amount': 106.0, 'invoice_type': '专票', 'vat_rate': '6%'}
            for i in range(20)
        ]

        task_id = pipeline.submit_batch(records)
        self.assertIsNotNone(task_id)

        # 模拟零阻塞轮询
        max_retries = 20
        completed = False
        final_progress = None
        for _ in range(max_retries):
            progress = pipeline.get_progress(task_id)
            if progress and progress['status'] == 'completed':
                completed = True
                final_progress = progress
                break
            time.sleep(0.05)

        self.assertTrue(completed, "Batch processing did not complete in time")
        if final_progress:
            self.assertEqual(final_progress['total'], 20)
            self.assertEqual(final_progress['completed'], 20)
            self.assertEqual(final_progress['total_valid'], 20)
            # 每条记录 6.0 的抵扣额和税额
            self.assertEqual(final_progress['total_deductible_amount'], 20 * 6.0)
            self.assertEqual(final_progress['total_tax_amount'], 20 * 6.0)
            self.assertEqual(len(final_progress['results']), 20)

        pipeline.shutdown()

    def test_batch_pipeline_empty(self):
        """测试流水线空列表兜底"""
        pipeline = BatchPipeline()
        task_id = pipeline.submit_batch([])
        progress = pipeline.get_progress(task_id)

        self.assertIsNotNone(progress)
        self.assertEqual(progress['status'], 'completed')
        self.assertEqual(progress['total'], 0)
        self.assertEqual(progress['completed'], 0)
        self.assertEqual(progress['progress_pct'], 100.0)
        pipeline.shutdown()

if __name__ == '__main__':
    unittest.main()
