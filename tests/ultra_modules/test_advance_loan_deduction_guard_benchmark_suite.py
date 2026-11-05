import unittest
import math
from ultra_modules.advance_loan_deduction_guard_core_engine import calculate_deduction_and_net_pay
from ultra_modules.advance_loan_deduction_guard_benchmark_suite import (
    generate_synthetic_fixtures,
    run_benchmark_suite
)

class TestAdvanceLoanDeductionGuardBenchmarkSuite(unittest.TestCase):

    def test_normal_operation(self):
        """测试正常参数下的计算结果"""
        result = calculate_deduction_and_net_pay(
            base_salary=5000,
            weekly_advances=[200, 300, 500],
            min_remaining_pay=1000
        )
        self.assertEqual(result["base_salary"], 5000.0)
        self.assertEqual(result["total_advance_requested"], 1000.0)
        self.assertEqual(result["actual_deduction"], 1000.0)
        self.assertEqual(result["net_pay"], 4000.0)
        self.assertEqual(result["unrecovered_advance"], 0.0)

    def test_dirty_data_self_healing(self):
        """测试脏数据自愈：NaN、负数、字符串类型的安全过滤与默认值"""
        result = calculate_deduction_and_net_pay(
            base_salary=float('nan'),
            weekly_advances=[float('nan'), -500, "abc"],
            min_remaining_pay=-200
        )
        self.assertEqual(result["base_salary"], 0.0)
        self.assertEqual(result["total_advance_requested"], 0.0)
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["net_pay"], 0.0)
        self.assertEqual(result["unrecovered_advance"], 0.0)

        result2 = calculate_deduction_and_net_pay(
            base_salary="6000",
            weekly_advances="1000",
            min_remaining_pay="500"
        )
        self.assertEqual(result2["base_salary"], 6000.0)
        self.assertEqual(result2["total_advance_requested"], 1000.0)
        self.assertEqual(result2["actual_deduction"], 1000.0)
        self.assertEqual(result2["net_pay"], 5000.0)

    def test_missing_params_fallback(self):
        """测试缺参兜底：参数缺失时的静默处理"""
        result = calculate_deduction_and_net_pay()
        self.assertEqual(result["base_salary"], 0.0)
        self.assertEqual(result["total_advance_requested"], 0.0)
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["net_pay"], 0.0)
        self.assertEqual(result["unrecovered_advance"], 0.0)

        result2 = calculate_deduction_and_net_pay(base_salary=None, weekly_advances=None, min_remaining_pay=None)
        self.assertEqual(result2["base_salary"], 0.0)
        self.assertEqual(result2["total_advance_requested"], 0.0)
        self.assertEqual(result2["actual_deduction"], 0.0)
        self.assertEqual(result2["net_pay"], 0.0)

    def test_extreme_boundaries(self):
        """测试极值跨界：超大数据类型与极度冗长的预支数组"""
        # 超大金额
        result = calculate_deduction_and_net_pay(
            base_salary=1e9,
            weekly_advances=[1e8] * 10,
            min_remaining_pay=1e7
        )
        self.assertEqual(result["base_salary"], 1e9)
        self.assertEqual(result["total_advance_requested"], 1e9)
        self.assertEqual(result["actual_deduction"], 1e9 - 1e7)
        self.assertEqual(result["net_pay"], 1e7)
        self.assertEqual(result["unrecovered_advance"], 1e7)

    def test_benchmark_performance_and_no_crashes(self):
        """测试性能基准与零崩溃：超大并发与夹具全覆盖"""
        fixtures = generate_synthetic_fixtures(size=10000)
        self.assertEqual(len(fixtures), 10000)

        stats = run_benchmark_suite(fixtures)

        # 确保无崩溃且处理了所有夹具
        self.assertTrue(stats["zero_crash"])
        self.assertEqual(stats["total_processed"], 10000)

        # 毫秒级响应要求 (平均单次执行时间应当极低，例如 < 1ms)
        self.assertTrue(stats["avg_latency_ms"] < 1.0, f"Average latency too high: {stats['avg_latency_ms']} ms")

    def test_benchmark_suite_default_fixtures(self):
        """测试不传参数时的基准测试默认行为（为了100%分支覆盖率）"""
        stats = run_benchmark_suite()
        self.assertTrue(stats["zero_crash"])
        self.assertEqual(stats["total_processed"], 10000)

    def test_run_benchmark_suite_crash(self):
        """覆盖 try...except Exception as e 抛出异常的分支"""
        with self.assertRaises(RuntimeError):
            # 传递不是字典的 fixture 故意让解包 kwargs 崩溃 (**fixture)
            run_benchmark_suite([123])

if __name__ == '__main__':
    unittest.main()
