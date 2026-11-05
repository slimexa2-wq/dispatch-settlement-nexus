import unittest
import json
from ultra_modules.CrossMonthDuplicateGuard_plain_explainer import CrossMonthDuplicateGuardExplainer

class TestCrossMonthDuplicateGuardExplainer(unittest.TestCase):

    def setUp(self):
        self.explainer = CrossMonthDuplicateGuardExplainer()

    def test_normal_case_safe(self):
        """Test normal case with no duplicates (safe)"""
        data = {
            "worker_name": "张三",
            "project_name": "A工厂",
            "duplicates": []
        }
        result = self.explainer.generate_explanation(data, "text")
        self.assertIn("[V] 未发现重复申领", result)
        self.assertIn("张三", result)
        self.assertIn("A工厂", result)
        self.assertIn("无异常重复返费记录", result)

    def test_normal_case_danger(self):
        """Test normal case with duplicates (danger)"""
        data = {
            "worker_name": "李四",
            "project_name": "B工厂",
            "duplicates": [
                {"month": "2023-01", "amount": 1000.50},
                {"month": "2023-02", "amount": 500.00}
            ]
        }
        result = self.explainer.generate_explanation(data, "text")
        self.assertIn("[!] 发现重复申领风险！", result)
        self.assertIn("李四", result)
        self.assertIn("B工厂", result)
        self.assertIn("2023-01 已经申领过 1000.50 元", result)
        self.assertIn("2023-02 已经申领过 500.00 元", result)
        self.assertIn("累计重复金额：1500.50 元", result)

    def test_dirty_data_self_healing(self):
        """Test with dirty data like wrong types and None values"""
        data = {
            "worker_name": None,
            "project_name": 12345,  # should be converted to string or use default
            "duplicates": [
                "not a dict",
                {"month": None, "amount": "1000"},  # amount as string
                {"month": "2023-03", "amount": "invalid"},  # invalid amount string
                {"month": "2023-04", "amount": -100}  # negative amount ignored
            ]
        }
        result = self.explainer.generate_explanation(data, "json")
        result_dict = json.loads(result)

        self.assertEqual(result_dict["worker_name"], "未知工人")
        self.assertEqual(result_dict["project_name"], "12345")
        self.assertEqual(result_dict["total_duplicate_amount"], 1000.0)
        self.assertEqual(len(result_dict["duplicates"]), 1)
        self.assertEqual(result_dict["duplicates"][0]["month"], "未知月份")

    def test_missing_parameter_default_fallback(self):
        """Test with completely missing or empty parameters"""
        # data is None
        result_none = self.explainer.generate_explanation(None, "markdown")
        self.assertIn("未知工人", result_none)
        self.assertIn("未知项目", result_none)
        self.assertIn("未发现重复申领", result_none)

        # format_type is None
        result_format_none = self.explainer.generate_explanation({}, None)
        self.assertIn("[V]", result_format_none)  # fallback to text

        # unexpected data type
        result_list = self.explainer.generate_explanation(["not", "a", "dict"])
        self.assertIn("未知工人", result_list)

    def test_extreme_edge_cases_formats(self):
        """Test with various output formats and extreme data"""
        data = {
            "worker_name": "  王五  ",
            "project_name": "",  # empty string falls back
            "duplicates": [
                {"month": "  ", "amount": 0},  # amount 0 ignored
                {"month": "2023-12", "amount": 999999999.99}  # huge amount
            ]
        }

        # Test HTML format
        html_result = self.explainer.generate_explanation(data, "html")
        self.assertIn('<div class="duplicate-guard-card"', html_result)
        self.assertIn("#dc3545", html_result)  # danger color
        self.assertIn("王五", html_result)
        self.assertIn("未知项目", html_result)
        self.assertIn("999999999.99", html_result)

        # Test Markdown format
        md_result = self.explainer.generate_explanation(data, "markdown")
        self.assertIn("### 🔴 发现重复申领风险！", md_result)
        self.assertIn("**结论**：", md_result)

        # Test unknown format
        unknown_result = self.explainer.generate_explanation(data, "unknown_format")
        self.assertIn("[!] 发现重复申领风险！", unknown_result) # falls back to text

    def test_extract_string_exceptions(self):
        """Test internal string extraction error handling"""
        class BadStr:
            def __str__(self):
                raise ValueError("Cannot convert to string")

        # should catch the exception and return default
        result = self.explainer._extract_string(BadStr(), "default")
        self.assertEqual(result, "default")

    def test_process_duplicates_exceptions(self):
        """Test internal duplicate processing with complex objects that fail string conversion"""
        class BadStr:
            def __str__(self):
                raise ValueError("Bad string")

        dups, total = self.explainer._process_duplicates([
            {"month": BadStr(), "amount": 100}
        ])

        self.assertEqual(len(dups), 1)
        self.assertEqual(dups[0]["month"], "未知月份")
        self.assertEqual(dups[0]["amount"], 100.0)
        self.assertEqual(total, 100.0)

if __name__ == '__main__':
    unittest.main()
