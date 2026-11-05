import unittest
from datetime import datetime, timedelta
from ultra_modules.CrossMonthDuplicateGuard_batch_pipeline import CrossMonthDuplicateGuard, run_pipeline

class TestCrossMonthDuplicateGuard(unittest.TestCase):

    def test_01_normal_pass(self):
        """测试正常通过，没有重复记录"""
        history = [
            {'worker_id': 'w1', 'project_id': 'p1', 'claim_date': '2023-01-01'}
        ]
        records = [
            {'worker_id': 'w1', 'project_id': 'p1', 'claim_date': '2023-05-01'}, # 过了90天
            {'worker_id': 'w2', 'project_id': 'p1', 'claim_date': '2023-02-01'}, # 不同的工人
        ]
        result = run_pipeline(records, history)
        self.assertEqual(len(result['passed']), 2)
        self.assertEqual(len(result['intercepted']), 0)
        self.assertEqual(result['progress_snapshot']['total'], 2)
        self.assertEqual(result['progress_snapshot']['completed'], 2)

    def test_02_duplicate_interception(self):
        """测试历史重复拦截和批次内重复拦截"""
        history = [
            {'worker_id': 'w1', 'project_id': 'p1', 'claim_date': '2023-01-01'}
        ]
        records = [
            {'worker_id': 'w1', 'project_id': 'p1', 'claim_date': '2023-02-15'}, # 被历史记录拦截 (45天)
            {'worker_id': 'w3', 'project_id': 'p3', 'claim_date': '2023-06-01'}, # 正常通过
            {'worker_id': 'w3', 'project_id': 'p3', 'claim_date': '2023-07-01'}, # 批次内重复拦截 (30天)
        ]
        result = run_pipeline(records, history)
        self.assertEqual(len(result['passed']), 1)
        self.assertEqual(len(result['intercepted']), 2)

        passed_workers = [r['record']['worker_id'] for r in result['passed']]
        self.assertIn('w3', passed_workers)

        intercepted_workers = [r['record']['worker_id'] for r in result['intercepted']]
        self.assertIn('w1', intercepted_workers)
        self.assertIn('w3', intercepted_workers)

    def test_03_dirty_data_self_healing(self):
        """测试脏数据自愈：缺失重要字段或数据格式错误"""
        history = []
        records = [
            {'worker_id': '', 'project_id': 'p1', 'claim_date': '2023-01-01'}, # 空worker_id自愈为随机ID
            {'worker_id': 'w2', 'project_id': None, 'claim_date': '2023-01-01'}, # 空project_id自愈为随机ID
            {'worker_id': 'w3', 'project_id': 'p3', 'claim_date': 'invalid_date'}, # 错误日期自愈为当前时间
            'string_record', # 错误数据类型自愈为带_raw字段的字典
        ]
        result = run_pipeline(records, history)
        self.assertEqual(len(result['passed']), 4)

        # 测试同一批次内的两个相同缺失ID会不会被错误当成同一个（因为自愈使用随机UUID，所以应该都通过）
        records2 = [
            {'worker_id': '', 'project_id': 'p1'},
            {'worker_id': '', 'project_id': 'p1'}
        ]
        result2 = run_pipeline(records2, history)
        self.assertEqual(len(result2['passed']), 2)

    def test_04_missing_parameter_fallback(self):
        """测试缺参默认兜底"""
        # 测试完全没有传入 records 或者传入的不是 list
        result1 = run_pipeline(None)
        self.assertEqual(result1['progress_snapshot']['total'], 0)

        result2 = run_pipeline({'worker_id': 'w1', 'project_id': 'p1', 'claim_date': '2023-01-01'})
        self.assertEqual(len(result2['passed']), 1)
        self.assertEqual(result2['progress_snapshot']['total'], 1)

    def test_05_extreme_boundary_high_throughput(self):
        """测试极端边界和高吞吐批量处理"""
        history = [{'worker_id': f'w{i}', 'project_id': 'p1', 'claim_date': '2023-01-01'} for i in range(10)]

        records = []
        # 生成 1000 条数据
        for i in range(1000):
            if i < 10:
                # 前10条会和历史冲突
                records.append({'worker_id': f'w{i}', 'project_id': 'p1', 'claim_date': '2023-02-01'})
            elif i < 20:
                # 10-19条 制造批次内冲突 5对
                worker_id = f'w_batch_{i%5}'
                records.append({'worker_id': worker_id, 'project_id': 'p2', 'claim_date': f'2023-05-{10+(i%2)}'})
            else:
                # 其他正常
                records.append({'worker_id': f'w_normal_{i}', 'project_id': 'p3', 'claim_date': '2023-08-01'})

        result = run_pipeline(records, history)

        self.assertEqual(result['progress_snapshot']['total'], 1000)
        self.assertEqual(result['progress_snapshot']['completed'], 1000)

        # 拦截：前10个（历史），中间10个中的5个（批次内） = 15个
        self.assertEqual(len(result['intercepted']), 15)
        # 通过：1000 - 15 = 985个
        self.assertEqual(len(result['passed']), 985)

if __name__ == '__main__':
    unittest.main()
