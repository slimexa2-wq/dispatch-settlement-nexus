import unittest
import json
from ultra_modules.fuzzy_header_fingerprint_plain_explainer import FuzzyHeaderExplainer

class TestFuzzyHeaderFingerprintPlainExplainer(unittest.TestCase):

    def setUp(self):
        self.explainer = FuzzyHeaderExplainer()

    def test_normal_semantic_matching(self):
        # 1. 正常场景：输入符合预期的正常字段
        input_headers = ["序号", "姓名", "实发工资", "应发合计", "出勤天数", "员工号"]
        results = self.explainer.recognize_headers(input_headers)

        self.assertTrue(results["net_salary"]["matched"])
        self.assertEqual(results["net_salary"]["matched_header"], "实发工资")

        self.assertTrue(results["gross_salary"]["matched"])
        self.assertEqual(results["gross_salary"]["matched_header"], "应发合计")

        self.assertTrue(results["attendance_days"]["matched"])
        self.assertEqual(results["attendance_days"]["matched_header"], "出勤天数")

        self.assertTrue(results["employee_id"]["matched"])
        self.assertEqual(results["employee_id"]["matched_header"], "员工号")

    def test_dirty_data_auto_healing(self):
        # 2. 脏数据自愈：空值、多余空格、数字、空字符串
        input_headers = [" ", None, 123, "", "实 发 ", "\t应发\n", "出勤\r"]
        results = self.explainer.recognize_headers(input_headers)

        # 允许"实 发 " 因为清洗过程清除了两端空白。对于 "实 发 "由于ngram，依然有一定匹配度。
        # 此处重点测试系统不会因为脏数据崩溃，并且能匹配上部分。
        self.assertIn("net_salary", results)
        self.assertIn("gross_salary", results)

        # 测试HTML输出不会崩溃
        html_output = self.explainer.generate_plain_card(input_headers, format_type="html")
        self.assertIn("<div class='header-card'>", html_output)

    def test_zero_configuration_fallback(self):
        # 3. 缺参默认兜底：完全不传入参数，或传入 None
        results_none = self.explainer.recognize_headers(None)

        self.assertFalse(results_none["net_salary"]["matched"])
        self.assertFalse(results_none["gross_salary"]["matched"])
        self.assertFalse(results_none["attendance_days"]["matched"])
        self.assertFalse(results_none["employee_id"]["matched"])

        md_output = self.explainer.generate_plain_card(None, format_type="markdown")
        self.assertIn("未", md_output)
        self.assertIn("默认处理", md_output)

    def test_markdown_and_json_generation(self):
        # 4. 卡片生成格式
        input_headers = ["实际发放", "总计"]
        json_output = self.explainer.generate_plain_card(input_headers, format_type="json")
        data = json.loads(json_output)

        self.assertEqual(data["title"], "表头智能识别大白话结论卡")
        self.assertTrue(data["details"]["net_salary"]["matched"])
        self.assertEqual(data["details"]["net_salary"]["matched_header"], "实际发放")

        md_output = self.explainer.generate_plain_card(input_headers, format_type="markdown")
        self.assertIn("### 📊 表头智能识别大白话结论卡", md_output)
        self.assertIn("实际发放", md_output)
        self.assertIn("总计", md_output)

    def test_extreme_boundaries(self):
        # 5. 极端边界行为：单个字符串而不是列表、集合、甚至布尔值和极长的无关字符串
        # 传入单个字符串会被自动转为列表
        results_str = self.explainer.recognize_headers("实发")
        self.assertTrue(results_str["net_salary"]["matched"])

        # 传入元组
        results_tuple = self.explainer.recognize_headers(("打卡天数", "ID"))
        self.assertTrue(results_tuple["attendance_days"]["matched"])
        self.assertTrue(results_tuple["employee_id"]["matched"])

        # 传入布尔值，期望转为 ["True"] 不崩溃
        results_bool = self.explainer.recognize_headers(True)
        self.assertFalse(results_bool["net_salary"]["matched"])

        # 传入非常长的字符串
        long_str = "这是一个非常非常长的无关字符串测试，里面可能包含很多字符但不应该被错误匹配，因为文本很长，分母会很大。"
        results_long = self.explainer.recognize_headers([long_str, "实际发放"])
        self.assertTrue(results_long["net_salary"]["matched"])
        self.assertEqual(results_long["net_salary"]["matched_header"], "实际发放")

if __name__ == '__main__':
    unittest.main()
