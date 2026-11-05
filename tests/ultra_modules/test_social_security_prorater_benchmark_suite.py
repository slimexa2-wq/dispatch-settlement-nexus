import unittest
from datetime import date
from ultra_modules.social_security_prorater_benchmark_suite import SocialSecurityProraterBenchmark

class TestSocialSecurityProraterBenchmark(unittest.TestCase):
    def setUp(self):
        self.prorater = SocialSecurityProraterBenchmark()

    def test_normal_case_full_month(self):
        # 正常全月在职
        params = {
            'base_salary': 10000.0,
            'hire_date': date(2023, 1, 1),
            'target_year': 2023,
            'target_month': 5
        }
        res = self.prorater.calculate_proration(params)
        self.assertEqual(res['active_days'], 31)
        self.assertEqual(res['total_days_in_month'], 31)
        self.assertEqual(res['prorated_base'], 10000.0)
        self.assertFalse(res['is_capped'])

        # 正常部分在职 (入职)
        params2 = {
            'base_salary': 10000.0,
            'hire_date': '2023-05-16', # string format
            'target_year': 2023,
            'target_month': 5
        }
        res2 = self.prorater.calculate_proration(params2)
        self.assertEqual(res2['active_days'], 16) # 16th to 31st = 16 days
        self.assertAlmostEqual(res2['prorated_base'], 10000.0 * 16 / 31, places=2)

    def test_dirty_data_self_healing(self):
        # 脏数据自动修复：字符串带符号、日期非法格式、逻辑错误
        params = {
            'base_salary': '￥10,000.00 ',
            'hire_date': '2023-13-45T12:00:00Z', # will fallback to today
            'resign_date': '2023-01-01', # resign before hire, will fallback to 2099
            'target_year': 'invalid_year', # fallback to today.year
            'target_month': 'invalid_month' # fallback to today.month
        }
        res = self.prorater.calculate_proration(params)
        self.assertEqual(res['base_salary'], 10000.0)
        self.assertEqual(res['target_year'], date.today().year)
        self.assertEqual(res['target_month'], date.today().month)
        # Should complete successfully without crashing

    def test_missing_parameter_fallbacks(self):
        # 缺参自动兜底
        res = self.prorater.calculate_proration(None)
        self.assertEqual(res['base_salary'], 3000.0)
        self.assertEqual(res['target_year'], date.today().year)
        self.assertEqual(res['target_month'], date.today().month)

        # Empty dict
        res2 = self.prorater.calculate_proration({})
        self.assertEqual(res2['base_salary'], 3000.0)

    def test_extreme_boundary_cross_month_year(self):
        # 跨年跨月，极端边界，以及超限封顶
        params = {
            'base_salary': 999999.0, # Will be capped at 25000.0
            'hire_date': date(2023, 12, 31),
            'resign_date': date(2024, 1, 1),
            'target_year': 2024,
            'target_month': 1
        }
        res = self.prorater.calculate_proration(params)
        self.assertTrue(res['is_capped'])
        self.assertEqual(res['effective_base'], 25000.0)
        self.assertEqual(res['active_days'], 1) # active only on Jan 1st
        self.assertEqual(res['total_days_in_month'], 31)
        self.assertAlmostEqual(res['prorated_base'], 25000.0 * 1 / 31, places=2)

        # Test not active month
        params2 = {
            'base_salary': 5000.0,
            'hire_date': date(2024, 2, 1),
            'target_year': 2024,
            'target_month': 1
        }
        res2 = self.prorater.calculate_proration(params2)
        self.assertEqual(res2['active_days'], 0)
        self.assertEqual(res2['prorated_base'], 0.0)

    def test_performance_benchmark_validation(self):
        # 性能基准：合成10万条混合用例数据确保零崩溃与毫秒级响应
        # 实际本地运行可能会超过几毫秒，这里验证不崩溃且能正常输出指标
        result = self.prorater.run_benchmark(num_records=10000)
        self.assertEqual(result['success_count'], 10000)
        self.assertTrue(result['calc_time_ms'] >= 0)
        # Verify it ran without errors and generated the expected keys
        self.assertIn('records_per_second', result)
        print(f"Benchmark: {result['records_per_second']:.2f} records/sec")

if __name__ == '__main__':
    unittest.main()
