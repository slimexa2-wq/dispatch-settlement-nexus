import unittest
import math
from ultra_modules.shift_overtime_converter_export_formatter import ShiftOvertimeConverterExportFormatter

class TestShiftOvertimeConverterExportFormatter(unittest.TestCase):
    def setUp(self):
        self.formatter = ShiftOvertimeConverterExportFormatter()

    def test_normal_calculations(self):
        records = [
            {"name": "张三", "regular_hours": 10, "weekend_hours": 8, "holiday_hours": 0, "night_shifts": 2}
        ]
        res = self.formatter.process_records(records, base_hourly_rate=20.0, night_shift_allowance=15.0)

        export = res["export_records"]
        self.assertEqual(len(export), 1)
        # eq_hours = 10*1.5 + 8*2.0 + 0*3.0 = 15 + 16 = 31
        # pay = 31 * 20 + 2 * 15 = 620 + 30 = 650
        self.assertEqual(export[0]["employee_name"], "张三")
        self.assertEqual(export[0]["equivalent_total_hours"], 31.0)
        self.assertEqual(export[0]["total_pay"], 650.0)
        self.assertEqual(export[0]["comments"], 0)

        self.assertIn("本次导出共 1 人", res["summary"])
        self.assertIn("31.0 小时", res["summary"])
        self.assertIn("650.0 元", res["summary"])

    def test_dirty_data_self_healing(self):
        records = [
            {"name": None, "regular_hours": "NaN", "weekend_hours": None, "holiday_hours": "none", "night_shifts": float('nan')},
            {"name": "NaN", "regular_hours": "invalid", "weekend_hours": "8", "holiday_hours": "", "night_shifts": "2.5"}
        ]
        res = self.formatter.process_records(records)

        export = res["export_records"]
        self.assertEqual(len(export), 2)

        # Rec 1: All should be zero/defaults
        self.assertEqual(export[0]["employee_name"], "未命名员工_1")
        self.assertEqual(export[0]["equivalent_total_hours"], 0.0)
        self.assertEqual(export[0]["total_pay"], 0.0)

        # Rec 2: regular=0, weekend=8, holiday=0, night_shifts=2 (int parse of 2.5)
        # eq_hours = 8*2.0 = 16
        # pay = 16 * 20 + 2 * 15 = 320 + 30 = 350
        self.assertEqual(export[1]["employee_name"], "未命名员工_2")
        self.assertEqual(export[1]["equivalent_total_hours"], 16.0)
        self.assertEqual(export[1]["night_shifts_count"], 2)
        self.assertEqual(export[1]["total_pay"], 350.0)
        self.assertEqual(export[1]["comments"], 0)

    def test_default_parameters_fallback(self):
        records = [
            {"name": "李四", "regular_hours": 10, "night_shifts": 1}
        ]
        # Pass negative rates to trigger fallback
        res = self.formatter.process_records(records, base_hourly_rate=-10.0, night_shift_allowance=None)

        export = res["export_records"]
        self.assertEqual(len(export), 1)
        # 10*1.5 = 15 hours. pay = 15 * 20 + 1 * 15 = 315
        self.assertEqual(export[0]["equivalent_total_hours"], 15.0)
        self.assertEqual(export[0]["total_pay"], 315.0)

    def test_extreme_boundary_data(self):
        records = [
            {"name": "王五", "regular_hours": -50, "weekend_hours": 1000, "holiday_hours": -10, "night_shifts": 100}
        ]
        res = self.formatter.process_records(records)

        export = res["export_records"]
        self.assertEqual(len(export), 1)
        # regular: max(0, min(-50, 300)) = 0
        # weekend: max(0, min(1000, 150)) = 150
        # holiday: max(0, min(-10, 100)) = 0
        # night: max(0, min(100, 31)) = 31

        # eq_hours = 150 * 2 = 300
        # pay = 300 * 20 + 31 * 15 = 6000 + 465 = 6465
        self.assertEqual(export[0]["equivalent_total_hours"], 300.0)
        self.assertEqual(export[0]["night_shifts_count"], 31)
        self.assertEqual(export[0]["total_pay"], 6465.0)

    def test_completely_missing_or_empty_input(self):
        # Empty list
        res = self.formatter.process_records([])
        self.assertEqual(res["export_records"], [])
        self.assertIn("本次导出共 0 人", res["summary"])

        # List with non-dict elements
        res2 = self.formatter.process_records([None, "invalid"])
        self.assertEqual(len(res2["export_records"]), 2)
        self.assertEqual(res2["export_records"][0]["employee_name"], "未命名员工_1")
        self.assertEqual(res2["export_records"][1]["employee_name"], "未命名员工_2")
        self.assertEqual(res2["export_records"][0]["total_pay"], 0.0)
        self.assertEqual(res2["export_records"][1]["total_pay"], 0.0)

if __name__ == '__main__':
    unittest.main()
