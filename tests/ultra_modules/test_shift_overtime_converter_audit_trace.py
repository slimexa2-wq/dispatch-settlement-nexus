import unittest
from ultra_modules.shift_overtime_converter_audit_trace import calculate_and_trace_overtime

class TestShiftOvertimeConverterAuditTrace(unittest.TestCase):

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
        result = calculate_and_trace_overtime(data)
        # 8 + 4 + (2 * 1.5) + (8 * 2.0) + (8 * 3.0) = 8 + 4 + 3 + 16 + 24 = 55
        self.assertEqual(result["total_equivalent_hours"], 55.0)
        # 55 * 20 + 4 * 2 = 1100 + 8 = 1108
        self.assertEqual(result["total_pay"], 1108.0)
        self.assertEqual(result["clean_day_shift_hours"], 8.0)
        self.assertEqual(result["clean_night_shift_hours"], 4.0)

        # Audit trace validation
        trace = result["audit_trace"]
        self.assertTrue(any(item["action"] == "data_sanitization_complete" for item in trace))
        self.assertTrue(any(item["action"] == "overtime_conversion" for item in trace))
        self.assertTrue(any(item["action"] == "payout_calculation" for item in trace))

    def test_missing_params(self):
        """2. 测试缺参情况。只提供部分参数或者根本不传参数（None）的情况"""
        # 测试部分缺参
        data_partial = {
            "day_shift_hours": 8,
            "base_hourly_rate": 20
        }
        result_partial = calculate_and_trace_overtime(data_partial)
        self.assertEqual(result_partial["total_equivalent_hours"], 8.0)
        self.assertEqual(result_partial["total_pay"], 160.0)
        self.assertEqual(result_partial["clean_night_shift_hours"], 0.0)

        trace = result_partial["audit_trace"]
        missing_logs = [item for item in trace if item["action"] == "missing_parameter_fallback"]
        self.assertTrue(len(missing_logs) > 0)
        self.assertTrue(any(log["field"] == "night_shift_hours" for log in missing_logs))

        # 测试完全缺参 None
        result_none = calculate_and_trace_overtime(None)
        self.assertEqual(result_none["total_equivalent_hours"], 0.0)
        self.assertEqual(result_none["total_pay"], 0.0)
        trace_none = result_none["audit_trace"]
        self.assertTrue(any(item["action"] == "default_initialization" for item in trace_none))

        # 测试空字典
        result_empty = calculate_and_trace_overtime({})
        self.assertEqual(result_empty["total_equivalent_hours"], 0.0)
        self.assertEqual(result_empty["total_pay"], 0.0)
        trace_empty = result_empty["audit_trace"]
        self.assertTrue(any(item["action"] == "missing_parameter_fallback" for item in trace_empty))

        # 测试数据类型不对的自愈
        result_invalid_type = calculate_and_trace_overtime("a_string")
        self.assertEqual(result_invalid_type["total_equivalent_hours"], 0.0)
        self.assertTrue(any(item["action"] == "data_type_healing" for item in result_invalid_type["audit_trace"]))


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
        result = calculate_and_trace_overtime(data)
        # day_shift_hours 清洗后是 8.0
        # night_shift_hours, weekday_overtime_hours, weekend_overtime_hours, holiday_overtime_hours 清洗后都是 0.0
        self.assertEqual(result["clean_day_shift_hours"], 8.0)
        self.assertEqual(result["clean_night_shift_hours"], 0.0)
        self.assertEqual(result["clean_weekday_ot_hours"], 0.0)
        self.assertEqual(result["total_equivalent_hours"], 8.0)
        self.assertEqual(result["total_pay"], 8.0 * 20.5)

        trace = result["audit_trace"]
        self.assertTrue(any(item["action"] == "dirty_data_healed" and item["field"] == "day_shift_hours" for item in trace))
        self.assertTrue(any(item["action"] == "dirty_data_dropped" and item["field"] == "night_shift_hours" for item in trace))
        self.assertTrue(any(item["action"] == "dirty_data_clamped" and item["field"] == "weekday_overtime_hours" for item in trace))
        self.assertTrue(any(item["action"] == "missing_parameter_fallback" and item["field"] == "weekend_overtime_hours" for item in trace))
        self.assertTrue(any(item["action"] == "dirty_data_dropped" and item["field"] == "holiday_overtime_hours" for item in trace))

    def test_extreme_boundaries(self):
        """4. 测试极端边界情况。非常大的数字、浮点数精度等"""
        data = {
            "holiday_overtime_hours": 1e6, # 非常大的数值
            "base_hourly_rate": 1e-2 # 非常小的数值
        }
        result = calculate_and_trace_overtime(data)
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
        result = calculate_and_trace_overtime(data)
        self.assertEqual(result["total_equivalent_hours"], 0.0)
        self.assertEqual(result["total_pay"], 0.0)

if __name__ == '__main__':
    unittest.main()
