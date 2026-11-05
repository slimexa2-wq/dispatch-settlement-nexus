import unittest
from ultra_modules.ResignedWorkerPayHold_plain_explainer import explain_pay_hold

class TestResignedWorkerPayHoldPlainExplainer(unittest.TestCase):
    def test_normal_abrupt_resignation_deduction_below_cap(self):
        # 1. 正常急辞，且扣款低于合规上限
        data = {
            "worker_name": "张三",
            "base_salary": 5000,
            "deduction_requested": 500,
            "is_abrupt_resignation": True,
            "max_deduction_rate": 0.2
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["worker_name"], "张三")
        self.assertEqual(res["base_salary"], 5000.0)
        self.assertEqual(res["actual_deduction"], 500.0)
        self.assertEqual(res["final_pay"], 4500.0)
        self.assertIn("未超过合规上限", res["plain_summary"])

    def test_extreme_boundary_deduction_exceeds_cap(self):
        # 2. 极端边界：扣款远超合规上限，应被强制截断
        data = {
            "worker_name": "李四",
            "base_salary": 4000,
            "deduction_requested": 4000, # 扣除全部工资
            "is_abrupt_resignation": True,
            "max_deduction_rate": 0.2
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["actual_deduction"], 800.0) # 4000 * 0.2
        self.assertEqual(res["final_pay"], 3200.0)
        self.assertIn("实际仅扣除 800.00 元", res["plain_summary"])
        self.assertIn("800.00", res["html_card"])
        self.assertIn("800.00", res["markdown_card"])

    def test_normal_resignation_blocks_deduction(self):
        # 3. 正常离职：无论申报多少扣款，强制拦截为 0
        data = {
            "worker_name": "王五",
            "base_salary": 6000,
            "deduction_requested": 1000,
            "is_abrupt_resignation": False
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["actual_deduction"], 0.0)
        self.assertEqual(res["final_pay"], 6000.0)
        self.assertIn("已被系统自动拦截", res["plain_summary"])

    def test_missing_and_dirty_data_fallback(self):
        # 4. 脏数据和缺参兜底：参数缺失或类型错误
        data = {
            # worker_name 缺失
            "base_salary": "￥3,000", # 包含多余字符
            "deduction_requested": None, # None
            "is_abrupt_resignation": "yes", # 字符串 true 语义
            "max_deduction_rate": 1.5 # 超过100%，应退回默认 0.2
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["worker_name"], "未知员工")
        self.assertEqual(res["base_salary"], 3000.0)
        self.assertEqual(res["deduction_requested"], 0.0)
        self.assertEqual(res["is_abrupt_resignation"], True)
        self.assertEqual(res["max_deduction_cap"], 600.0) # 3000 * 0.2
        self.assertEqual(res["actual_deduction"], 0.0)
        self.assertEqual(res["final_pay"], 3000.0)
        self.assertIn("未申报扣款", res["plain_summary"])

    def test_not_a_dict_input(self):
        # 5. 完全非预期的输入类型，自愈为默认值
        res = explain_pay_hold(None)
        self.assertEqual(res["worker_name"], "未知员工")
        self.assertEqual(res["base_salary"], 0.0)
        self.assertEqual(res["actual_deduction"], 0.0)
        self.assertEqual(res["final_pay"], 0.0)
        self.assertIn("正常离职，无相关扣款", res["plain_summary"])

    def test_clean_float_boolean(self):
        # Additional coverage for _clean_float with boolean
        data = {
            "worker_name": "赵六",
            "base_salary": True,
            "deduction_requested": "invalid",
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["base_salary"], 1.0)
        self.assertEqual(res["deduction_requested"], 0.0)

    def test_clean_string_none(self):
        # Additional coverage for _clean_string
        data = {
            "worker_name": None
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["worker_name"], "未知员工")

    def test_clean_string_empty(self):
        # Additional coverage for _clean_string
        data = {
            "worker_name": "   "
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["worker_name"], "未知员工")

    def test_clean_string_not_string(self):
        # Additional coverage for _clean_string
        data = {
            "worker_name": 123
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["worker_name"], "123")

    def test_clean_bool_int(self):
        # Additional coverage for _clean_bool
        data = {
            "is_abrupt_resignation": 1
        }
        res = explain_pay_hold(data)
        self.assertTrue(res["is_abrupt_resignation"])

    def test_clean_float_invalid_str(self):
        # cover line 14 in ultra_modules/ResignedWorkerPayHold_plain_explainer.py
        data = {
            "base_salary": "invalid_string_no_numbers"
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["base_salary"], 0.0)

    def test_clean_bool_invalid_type(self):
        # cover line 32 in ultra_modules/ResignedWorkerPayHold_plain_explainer.py
        data = {
            "is_abrupt_resignation": []
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["is_abrupt_resignation"], False)

    def test_clean_float_invalid_type(self):
        # cover line 14 in ultra_modules/ResignedWorkerPayHold_plain_explainer.py
        data = {
            "base_salary": []
        }
        res = explain_pay_hold(data)
        self.assertEqual(res["base_salary"], 0.0)

if __name__ == '__main__':
    unittest.main()
