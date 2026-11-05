import unittest
import time
from decimal import Decimal
from ultra_modules.ClientBillSummaryGenerator_self_healing_guard import ClientBillSummaryGenerator

class TestClientBillSummaryGenerator(unittest.TestCase):
    def setUp(self):
        self.generator = ClientBillSummaryGenerator()

    def test_normal_case(self):
        """测试1：正常输入情况"""
        details = [
            {'worker_id': 'w1', 'hours': 160, 'hourly_rate': 25.5},
            {'worker_id': 'w2', 'hours': '150.5', 'hourly_rate': '30.0'}
        ]
        result = self.generator.generate_bill_summary(
            client_id='C001', month='2026-07', work_details=details,
            management_fee_rate=0.1, tax_rate=0.06
        )

        summary = result['summary']
        # cost w1 = 160 * 25.5 = 4080.00
        # cost w2 = 150.5 * 30.0 = 4515.00
        # total_work_cost = 8595.00
        # management_fee = 8595.00 * 0.1 = 859.50
        # subtotal = 9454.50
        # tax_fee = 9454.50 * 0.06 = 567.27
        # total = 9454.50 + 567.27 = 10021.77
        self.assertEqual(summary['total_work_cost'], '8595.00')
        self.assertEqual(summary['management_fee'], '859.50')
        self.assertEqual(summary['tax_fee'], '567.27')
        self.assertEqual(summary['total_bill'], '10021.77')

    def test_dirty_data_self_healing(self):
        """测试2：脏数据自愈（带符号、乱码、非数字、负数等）"""
        details = [
            {'worker_id': 'w1', 'hours': '￥160', 'hourly_rate': '25.5元'}, # 无效 rate -> default 0
            {'worker_id': 'w2', 'hours': '-10', 'hourly_rate': -5}, # 负数自愈为0
            {'worker_id': 'w3', 'hours': 'not a number', 'hourly_rate': '¥30,000.50'}
        ]
        result = self.generator.generate_bill_summary(
            client_id='C002', month='2026-07', work_details=details,
            management_fee_rate='abc', tax_rate='def' # 非法费率
        )

        summary = result['summary']
        # w1: rate default to 0 -> cost 0
        # w2: -10, -5 -> max(x, 0) -> cost 0
        # w3: hours not a number -> default 0 -> cost 0
        self.assertEqual(summary['total_work_cost'], '0.00')
        # Rate self healing to 5% and 6% but work cost is 0.00
        self.assertEqual(summary['management_fee'], '0.00')
        self.assertEqual(summary['tax_fee'], '0.00')
        self.assertEqual(summary['total_bill'], '0.00')

    def test_missing_parameters_default(self):
        """测试3：缺参默认兜底"""
        result = self.generator.generate_bill_summary(client_id=None, month=None)
        self.assertEqual(result['client_id'], 'default_client')
        self.assertEqual(result['month'], 'default_month')
        self.assertEqual(result['details'], [])

        summary = result['summary']
        self.assertEqual(summary['total_work_cost'], '0.00')
        self.assertEqual(summary['total_bill'], '0.00')

    def test_extreme_edge_cases(self):
        """测试4：极端边界情况"""
        # 超大金额、极小金额截断、非列表details
        details = [
            {'worker_id': 'w1', 'hours': 999999999, 'hourly_rate': 999999999},
            {'worker_id': 'w2', 'hours': 0.00001, 'hourly_rate': 0.00001}
        ]
        result = self.generator.generate_bill_summary(
            client_id='C004', month='2026-07', work_details=details,
            management_fee_rate=1.5, tax_rate=-0.5 # 超出 0-1 范围，退回默认 0.05, 0.06
        )
        summary = result['summary']

        # w1 = 999999999 * 999999999 = 999999998000000001
        # w2 = 0.00001 * 0.00001 = 0.0000000001 -> quantize 0.01 -> 0.00
        self.assertEqual(summary['total_work_cost'], '999999998000000001.00')
        # 默认 5% -> 49999999900000000.05
        self.assertEqual(summary['management_fee'], '49999999900000000.05')

    def test_undo_mechanism(self):
        """测试5：一键撤回机制"""
        details = [{'worker_id': 'w1', 'hours': 100, 'hourly_rate': 20}]
        result = self.generator.generate_bill_summary('C005', '2026-07', details)

        snapshot_id = result['snapshot_id']

        # 立即撤回
        undo_res = self.generator.undo_generation(snapshot_id)
        self.assertTrue(undo_res['success'])

        # 再次撤回应该失败（已作废）
        undo_res_2 = self.generator.undo_generation(snapshot_id)
        self.assertFalse(undo_res_2['success'])
        self.assertEqual(undo_res_2['message'], 'Snapshot not found.')

    def test_undo_mechanism_timeout(self):
        """测试6：撤回超时机制"""
        details = [{'worker_id': 'w1', 'hours': 100, 'hourly_rate': 20}]
        result = self.generator.generate_bill_summary('C005', '2026-07', details)

        snapshot_id = result['snapshot_id']

        # 修改 generator 内部快照时间模拟过期
        self.generator._snapshots[snapshot_id]['timestamp'] -= 6.0

        # 过期撤回应该失败
        undo_res = self.generator.undo_generation(snapshot_id)
        self.assertFalse(undo_res['success'])
        self.assertEqual(undo_res['message'], 'Undo window expired.')

if __name__ == '__main__':
    unittest.main()
