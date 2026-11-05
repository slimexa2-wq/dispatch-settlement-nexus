import unittest
from ultra_modules.shift_overtime_converter_core_engine import calculate_equivalent_hours

class TestShiftOvertimeConverter(unittest.TestCase):

    def test_normal_data(self):
        """1. 测试正常数据。白班夜班，各种加班时间都有的情况"""
        data = {
            "day_shift_hours": 8,
            "night_shift_hours": 4,
            "weekday_overtime_hours": 2,
            "weekend_overtime_hours": 8,
            "holiday_overtime_hours": 8,
            "base_hourly_rate": 20,
            "night_allowance_per_hour": 2
        }
        result = calculate_equivalent_hours(data)
        # 8 + 4 + (2 * 1.5) + (8 * 2.0) + (8 * 3.0) = 8 + 4 + 3 + 16 + 24 = 55
        self.assertEqual(result["total_equivalent_hours"], 55.0)
        # 55 * 20 + 4 * 2 = 1100 + 8 = 1108
        self.assertEqual(result["total_pay"], 1108.0)
        self.assertEqual(result["clean_day_shift_hours"], 8.0)
        self.assertEqual(result["clean_night_shift_hours"], 4.0)

    def test_missing_params(self):
        """2. 测试缺参情况。只提供部分参数或者根本不传参数（None）的情况"""
        # 测试部分缺参
        data_partial = {
            "day_shift_hours": 8,
            "base_hourly_rate": 20
        }
        result_partial = calculate_equivalent_hours(data_partial)
        self.assertEqual(result_partial["total_equivalent_hours"], 8.0)
        self.assertEqual(result_partial["total_pay"], 160.0)
        self.assertEqual(result_partial["clean_night_shift_hours"], 0.0)

        # 测试完全缺参 None
        result_none = calculate_equivalent_hours(None)
        self.assertEqual(result_none["total_equivalent_hours"], 0.0)
        self.assertEqual(result_none["total_pay"], 0.0)

        # 测试空字典
        result_empty = calculate_equivalent_hours({})
        self.assertEqual(result_empty["total_equivalent_hours"], 0.0)
        self.assertEqual(result_empty["total_pay"], 0.0)

    def test_dirty_data_healing(self):
        """3. 测试脏数据静默清洗。提供非数字字符串、负数等脏数据的情况"""
        data = {
            "day_shift_hours": "8", # 可以被转换的字符串
            "night_shift_hours": "invalid", # 无法转换的字符串
            "weekday_overtime_hours": -5, # 负数
            "weekend_overtime_hours": None, # None
            "holiday_overtime_hours": [], # 列表类型
            "base_hourly_rate": 20.5
        }
        result = calculate_equivalent_hours(data)
        # day_shift_hours 清洗后是 8.0
        # night_shift_hours, weekday_overtime_hours, weekend_overtime_hours, holiday_overtime_hours 清洗后都是 0.0
        self.assertEqual(result["clean_day_shift_hours"], 8.0)
        self.assertEqual(result["clean_night_shift_hours"], 0.0)
        self.assertEqual(result["clean_weekday_ot_hours"], 0.0)
        self.assertEqual(result["total_equivalent_hours"], 8.0)
        self.assertEqual(result["total_pay"], 8.0 * 20.5)

    def test_extreme_boundaries(self):
        """4. 测试极端边界情况。非常大的数字、浮点数精度等"""
        data = {
            "holiday_overtime_hours": 1e6, # 非常大的数值
            "base_hourly_rate": 1e-2 # 非常小的数值
        }
        result = calculate_equivalent_hours(data)
        self.assertEqual(result["clean_holiday_ot_hours"], 1000000.0)
        self.assertEqual(result["total_equivalent_hours"], 3000000.0)
        self.assertEqual(result["total_pay"], 30000.0)

    def test_all_zeros(self):
        """5. 测试全部为 0 的情况。"""
        data = {
            "day_shift_hours": 0,
            "night_shift_hours": 0,
            "weekday_overtime_hours": 0,
            "weekend_overtime_hours": 0,
            "holiday_overtime_hours": 0,
            "base_hourly_rate": 0,
            "night_allowance_per_hour": 0
        }
        result = calculate_equivalent_hours(data)
        self.assertEqual(result["total_equivalent_hours"], 0.0)
        self.assertEqual(result["total_pay"], 0.0)

if __name__ == '__main__':
    unittest.main()
