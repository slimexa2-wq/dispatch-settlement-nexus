import unittest
import math
from ultra_modules.advance_loan_deduction_guard_core_engine import calculate_deduction_and_net_pay

class TestAdvanceLoanDeductionGuardCoreEngine(unittest.TestCase):

    def test_normal_operation(self):
        """测试正常抵扣流程：没有触碰到底线，完全收回预支"""
        result = calculate_deduction_and_net_pay(
            base_salary=5000.0,
            weekly_advances=[500, 300, 200],
            min_remaining_pay=1000.0
        )
        self.assertEqual(result["base_salary"], 5000.0)
        self.assertEqual(result["total_advance_requested"], 1000.0)
        self.assertEqual(result["actual_deduction"], 1000.0)
        self.assertEqual(result["net_pay"], 4000.0)
        self.assertEqual(result["unrecovered_advance"], 0.0)

    def test_missing_params(self):
        """测试缺省参数自动兜底：完全不传参数，或传入None"""
        result = calculate_deduction_and_net_pay()
        self.assertEqual(result["base_salary"], 0.0)
        self.assertEqual(result["total_advance_requested"], 0.0)
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["net_pay"], 0.0)
        self.assertEqual(result["unrecovered_advance"], 0.0)

    def test_dirty_data(self):
        """测试脏数据自愈：含有无效的字符串、None、负数"""
        result = calculate_deduction_and_net_pay(
            base_salary="3000",
            weekly_advances=["abc", -100, None, 500, 400],
            min_remaining_pay="invalid"
        )
        self.assertEqual(result["base_salary"], 3000.0)
        self.assertEqual(result["total_advance_requested"], 900.0)
        self.assertEqual(result["actual_deduction"], 900.0)
        self.assertEqual(result["net_pay"], 2100.0)
        self.assertEqual(result["unrecovered_advance"], 0.0)

    def test_over_deduction_protection(self):
        """测试防超扣保护：预支大于可扣额度（需要保留底薪）"""
        result = calculate_deduction_and_net_pay(
            base_salary=2000.0,
            weekly_advances=[1000, 1000, 500],
            min_remaining_pay=1000.0
        )
        self.assertEqual(result["base_salary"], 2000.0)
        self.assertEqual(result["total_advance_requested"], 2500.0)
        self.assertEqual(result["actual_deduction"], 1000.0) # 最多扣 (2000 - 1000)
        self.assertEqual(result["net_pay"], 1000.0)
        self.assertEqual(result["unrecovered_advance"], 1500.0)

    def test_extreme_bounds_and_nan(self):
        """测试极端边界及 NaN：极大的底薪、负数底薪、NaN值等"""
        result = calculate_deduction_and_net_pay(
            base_salary=float('nan'),
            weekly_advances=float('nan'),
            min_remaining_pay=float('nan')
        )
        self.assertEqual(result["base_salary"], 0.0)
        self.assertEqual(result["total_advance_requested"], 0.0)
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["net_pay"], 0.0)

        # 测试如果 min_remaining_pay 远大于 base_salary
        result2 = calculate_deduction_and_net_pay(
            base_salary=1000.0,
            weekly_advances=[500],
            min_remaining_pay=2000.0
        )
        self.assertEqual(result2["base_salary"], 1000.0)
        self.assertEqual(result2["total_advance_requested"], 500.0)
        self.assertEqual(result2["actual_deduction"], 0.0) # 一分钱也不能扣
        self.assertEqual(result2["net_pay"], 1000.0)
        self.assertEqual(result2["unrecovered_advance"], 500.0)

        # 测试负工资
        result3 = calculate_deduction_and_net_pay(
            base_salary=-1000.0,
            weekly_advances=[500],
        )
        self.assertEqual(result3["base_salary"], 0.0)
        self.assertEqual(result3["actual_deduction"], 0.0)
        self.assertEqual(result3["net_pay"], 0.0)

        # 触发 base_salary 类型的 ValueError/TypeError (不能转换的复杂对象)
        result4 = calculate_deduction_and_net_pay(
            base_salary=object(),
            min_remaining_pay=object()
        )
        self.assertEqual(result4["base_salary"], 0.0)

        # 触发 single value weekly_advances 的 Exception
        result5 = calculate_deduction_and_net_pay(
            weekly_advances=object()
        )
        self.assertEqual(result5["total_advance_requested"], 0.0)

    def test_weekly_advances_as_single_value(self):
        """测试 weekly_advances 容错：当不小心传入单个值而不是列表时"""
        result = calculate_deduction_and_net_pay(
            base_salary=2000.0,
            weekly_advances=500.0,
            min_remaining_pay=0.0
        )
        self.assertEqual(result["base_salary"], 2000.0)
        self.assertEqual(result["total_advance_requested"], 500.0)
        self.assertEqual(result["actual_deduction"], 500.0)
        self.assertEqual(result["net_pay"], 1500.0)
        self.assertEqual(result["unrecovered_advance"], 0.0)

if __name__ == '__main__':
    unittest.main()
