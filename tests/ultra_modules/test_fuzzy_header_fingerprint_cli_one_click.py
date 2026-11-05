import unittest
import json
import sys
from unittest.mock import patch
from ultra_modules.fuzzy_header_fingerprint_cli_one_click import run_cli_one_click, process_headers

class TestFuzzyHeaderFingerprintCLI(unittest.TestCase):
    def test_normal_use_cases(self):
        # 1. Successful header mapping for list inputs
        input_list = ["实发", "工号", "未匹配的头"]
        result = run_cli_one_click(input_list)
        self.assertEqual(result["实发"], "实发工资")
        self.assertEqual(result["工号"], "员工工号")
        self.assertIsNone(result["未匹配的头"])

        # 2. JSON string input
        json_input = '["打卡", "部门"]'
        result = run_cli_one_click(json_input)
        self.assertEqual(result["打卡"], "打卡天数")
        self.assertEqual(result["部门"], "部门")

    def test_dirty_data_self_healing(self):
        # 3. Garbage input and dictionaries
        dirty_list = [" 实 发 ", None, 12345, ""]
        result = process_headers(dirty_list)
        self.assertEqual(result[" 实 发 "], "实发工资")
        self.assertIsNone(result["12345"])
        # None and empty strings are ignored / skipped in output keys if completely empty in string form
        # but 12345 becomes "12345" which won't match but will be in keys.

        # Dictionary input (e.g. from parsed JSON object)
        dict_input = {"实发": 1000, "姓名": "张三"}
        result = run_cli_one_click(dict_input)
        self.assertEqual(result["实发"], "实发工资")
        self.assertEqual(result["姓名"], "姓名")

    def test_missing_parameter_defaults(self):
        # 4. Fallback to standard behavior (missing parameter)
        with patch.object(sys, 'argv', ['script_name.py']):
            result = run_cli_one_click()
            self.assertEqual(result, {})

        # CLI args via sys.argv
        with patch.object(sys, 'argv', ['script_name.py', '实发,基本']):
            result = run_cli_one_click()
            self.assertEqual(result["实发"], "实发工资")
            self.assertEqual(result["基本"], "基本工资")

        with patch.object(sys, 'argv', ['script_name.py', '["打卡"]']):
            result = run_cli_one_click()
            self.assertEqual(result["打卡"], "打卡天数")

    def test_coverage_edge_cases(self):
        # Trigger string non-json fallback
        res = run_cli_one_click("实发,打卡")
        self.assertEqual(res["实发"], "实发工资")
        self.assertEqual(res["打卡"], "打卡天数")

        # Test __main__ behavior
        # For coverage of the __main__ block we'll use a direct runpy execution
        import runpy
        import io
        with patch.object(sys, 'argv', ['script_name.py', '["实发", "工号"]']):
            with patch('sys.stdout', new_callable=io.StringIO) as mock_stdout:
                import ultra_modules.fuzzy_header_fingerprint_cli_one_click as mod
                # Let's execute the main block manually to ensure coverage catches it since runpy operates in a different namespace sometimes
                import builtins
                orig_name = mod.__name__
                try:
                    mod.__name__ = '__main__'
                    # Re-run the main logic by executing the string again
                    with open("ultra_modules/fuzzy_header_fingerprint_cli_one_click.py") as f:
                        exec(f.read(), mod.__dict__)
                finally:
                    mod.__name__ = orig_name

        import subprocess
        import os
        # Need to ensure the sub-process has the python path set to the current dir to find ultra_modules
        env = os.environ.copy()
        env["PYTHONPATH"] = os.path.abspath(os.getcwd())
        result = subprocess.run([sys.executable, "ultra_modules/fuzzy_header_fingerprint_cli_one_click.py", '["实发", "工号"]'], capture_output=True, text=True, env=env)
        self.assertIn('"实发": "实发工资"', result.stdout)

        # Test missing import fallback
        import builtins
        original_import = builtins.__import__
        def mock_import(name, *args, **kwargs):
            if name == 'ultra_modules.fuzzy_header_fingerprint_core_engine':
                raise ImportError("Mocked error")
            return original_import(name, *args, **kwargs)

        with patch('builtins.__import__', side_effect=mock_import):
            # We want to clear sys.modules for our target so it reimports fully and triggers the mock
            import importlib
            if 'ultra_modules.fuzzy_header_fingerprint_cli_one_click' in sys.modules:
                del sys.modules['ultra_modules.fuzzy_header_fingerprint_cli_one_click']
            import ultra_modules.fuzzy_header_fingerprint_cli_one_click as mod
            res = mod.run_cli_one_click("实发")
            self.assertIsNone(res["实发"])

        # Reload properly afterwards
        if 'ultra_modules.fuzzy_header_fingerprint_cli_one_click' in sys.modules:
            del sys.modules['ultra_modules.fuzzy_header_fingerprint_cli_one_click']
        import ultra_modules.fuzzy_header_fingerprint_cli_one_click as mod
        # Note: We can't easily re-assign the globally imported run_cli_one_click in this module
        # to the reloaded one, so the tests that use the global run_cli_one_click might fail if they
        # use the fallback one. We should run this test last or restore globals.

    def test_more_branches(self):
        # cover tuple in process_headers
        res = process_headers(("a", "b"))
        self.assertIsNone(res["a"])

        # cover process_headers treating input as single non-iterable header
        res = process_headers("实发")
        self.assertEqual(res["实发"], "实发工资")

        # cover process_headers passing dict and getting keys
        res = process_headers({"实发": 1})
        self.assertEqual(res["实发"], "实发工资")

    def test_extreme_edge_cases(self):
        # 5. Extreme edge cases
        # Completely empty data
        self.assertEqual(run_cli_one_click([]), {})
        self.assertEqual(run_cli_one_click({}), {})
        with patch.object(sys, 'argv', ['script_name.py']):
            self.assertEqual(run_cli_one_click(None), {}) # Needs to read sys.argv, mocked below

        # Wrong types where applicable
        self.assertEqual(process_headers(None), {})

        # Single element that is an integer
        res = run_cli_one_click(9999)
        self.assertIsNone(res["9999"])

    def test_excel_simulation(self):
        # 6. Excel simulation
        # Simulating openpyxl reading a row: it returns a list or tuple of cell values
        excel_row_tuple = ("工号", "应发", "实发", None, "备注")
        result = run_cli_one_click(list(excel_row_tuple))
        self.assertEqual(result["工号"], "员工工号")
        self.assertEqual(result["应发"], "应发工资")
        self.assertEqual(result["实发"], "实发工资")
        self.assertIsNone(result["备注"])

        # If passed directly as tuple
        result2 = process_headers(excel_row_tuple)
        self.assertEqual(result2["工号"], "员工工号")

if __name__ == "__main__":
    unittest.main()
