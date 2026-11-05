import unittest
import math
from ultra_modules.fuzzy_header_fingerprint_export_formatter import FuzzyHeaderFingerprintExportFormatter

class TestFuzzyHeaderFingerprintExportFormatter(unittest.TestCase):
    def setUp(self):
        self.formatter = FuzzyHeaderFingerprintExportFormatter()

    def test_normal_execution(self):
        """Test Case 1: Normal execution with clear mapping and valid data."""
        headers = ["员工编号", "姓名", "考勤天数", "总应发", "最终实发", "备注"]
        data = [
            {"员工编号": "EMP001", "姓名": "张三", "考勤天数": 22.5, "总应发": 10000.0, "最终实发": 8500.0, "备注": "正常"},
            {"员工编号": "EMP002", "姓名": "李四", "考勤天数": 21, "总应发": 9000, "最终实发": 7800, "备注": ""}
        ]

        clean_data, report = self.formatter.format_data(headers, data)

        self.assertEqual(len(clean_data), 2)
        self.assertEqual(clean_data[0]["employee_id"], "EMP001")
        self.assertEqual(clean_data[0]["attendance_days"], 22.5)
        self.assertEqual(clean_data[0]["payable"], 10000.0)
        self.assertEqual(clean_data[0]["actual_pay"], 8500.0)
        self.assertEqual(clean_data[0]["comments"], 0)

        self.assertIn("共计 2 人次", report)
        self.assertIn("累计打卡 43.5 天", report)
        self.assertIn("应发总计 19000 元", report)
        self.assertIn("实发总计 16300 元", report)

    def test_dirty_data_self_healing(self):
        """Test Case 2: Dirty data self-healing (NaN, None, unconvertible strings)."""
        headers = ["工号", "应发", "实发工资"]
        data = [
            {"工号": "001", "应发": float('nan'), "实发工资": None},
            {"工号": "002", "应发": "N/A", "实发工资": float('inf')}
        ]

        clean_data, report = self.formatter.format_data(headers, data)

        self.assertEqual(len(clean_data), 2)
        # NaN and None should be healed to 0.0 for numeric target fields
        self.assertEqual(clean_data[0]["payable"], 0.0)
        self.assertEqual(clean_data[0]["actual_pay"], 0.0)
        # N/A and inf should be healed to 0.0
        self.assertEqual(clean_data[1]["payable"], 0.0)
        self.assertEqual(clean_data[1]["actual_pay"], 0.0)

        # Comments should be strictly 0
        self.assertEqual(clean_data[0]["comments"], 0)
        self.assertEqual(clean_data[1]["comments"], 0)

    def test_missing_parameter_default_fallbacks(self):
        """Test Case 3: Missing parameter default fallbacks (empty/None lists)."""
        # Both headers and data None
        clean_data, report = self.formatter.format_data(None, None)
        self.assertEqual(clean_data, [])
        self.assertIn("共计 0 人次", report)

        # Missing headers but has data
        clean_data, report = self.formatter.format_data(None, [{"实发": 100}])
        self.assertEqual(len(clean_data), 1)
        self.assertEqual(clean_data[0]["actual_pay"], 100)

    def test_extreme_boundary_values(self):
        """Test Case 4: Extreme boundary values (massive numbers, negative values)."""
        headers = ["工号", "合计应发", "实发"]
        data = [
            {"工号": "MAX", "合计应发": 1e10, "实发": 1e10 - 500},
            {"工号": "MIN", "合计应发": -500, "实发": -500}
        ]

        clean_data, report = self.formatter.format_data(headers, data)

        self.assertEqual(len(clean_data), 2)
        self.assertEqual(clean_data[0]["payable"], 1e10)
        self.assertEqual(clean_data[0]["actual_pay"], 1e10 - 500)
        self.assertEqual(clean_data[1]["payable"], -500)

        self.assertIn("应发总计 1e+10 元", report)

    def test_no_headers_match(self):
        """Test Case 5: Edge case where no headers match."""
        headers = ["无关字段1", "无关字段2", "RandomHeader"]
        data = [
            {"无关字段1": "A", "无关字段2": "B", "RandomHeader": 123}
        ]

        clean_data, report = self.formatter.format_data(headers, data)

        self.assertEqual(len(clean_data), 1)
        # Should keep original keys
        self.assertEqual(clean_data[0]["无关字段1"], "A")
        self.assertEqual(clean_data[0]["RandomHeader"], 123)
        self.assertEqual(clean_data[0]["comments"], 0)

        # Sums should be 0
        self.assertIn("累计打卡 0 天", report)
        self.assertIn("应发总计 0 元", report)

if __name__ == '__main__':
    unittest.main()
