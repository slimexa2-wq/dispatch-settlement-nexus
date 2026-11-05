import unittest
from ultra_modules.fuzzy_header_fingerprint_core_engine import (
    identify_header,
    _clean_string,
    _get_fingerprint,
    _cosine_similarity
)

class TestFuzzyHeaderFingerprintCoreEngine(unittest.TestCase):
    def test_normal_matching(self):
        # Exact match
        self.assertEqual(identify_header("实发工资"), "实发工资")

        # Substring/fuzzy match
        self.assertEqual(identify_header("实发"), "实发工资")
        self.assertEqual(identify_header("员工工号"), "员工工号")
        self.assertEqual(identify_header("工号"), "员工工号")
        self.assertEqual(identify_header("打卡"), "打卡天数")

    def test_dirty_data_self_healing(self):
        # White spaces and weird characters
        self.assertEqual(identify_header(" 实  发 工 资 "), "实发工资")
        self.assertEqual(identify_header("\t实\n发工\r资"), "实发工资")
        self.assertEqual(identify_header("【实发工资】"), "实发工资")
        self.assertEqual(identify_header("打*卡*天*数?"), "打卡天数")

    def test_missing_parameters_fallback(self):
        # None as target_headers
        self.assertEqual(identify_header("基本工资", None), "基本工资")

        # Empty list as target_headers
        self.assertEqual(identify_header("出勤天数", []), "出勤天数")

        # Invalid type as target_headers
        self.assertEqual(identify_header("部门", "invalid_type"), "部门")

    def test_extreme_boundaries(self):
        # Empty inputs
        self.assertIsNone(identify_header(""))
        self.assertIsNone(identify_header(None))
        self.assertIsNone(identify_header("   "))
        self.assertIsNone(identify_header("!@#$%"))

        # Non-string input
        self.assertIsNone(identify_header(12345))

        # Threshold too high
        self.assertIsNone(identify_header("实发", threshold=0.9))

        # Short strings matching correctly
        self.assertEqual(identify_header("实", threshold=0.1), "实发工资")

        # Targets that are cleaned to empty
        targets = ["", " ", "!!!", "实发工资"]
        self.assertEqual(identify_header("实发工资", target_headers=targets), "实发工资")
        self.assertIsNone(identify_header("!!!", target_headers=targets))

    def test_internal_helpers(self):
        # Test _clean_string
        self.assertEqual(_clean_string("A B  C"), "abc")
        self.assertEqual(_clean_string(None), "")
        self.assertEqual(_clean_string(["not", "a", "string"]), "notastring")

        # Test _get_fingerprint
        fp = _get_fingerprint("ab")
        self.assertEqual(fp, {"a": 1, "b": 1, "ab": 1})

        # Test _cosine_similarity
        self.assertEqual(_cosine_similarity({}, {"a": 1}), 0.0)
        self.assertEqual(_cosine_similarity({"a": 1}, {}), 0.0)
        self.assertAlmostEqual(_cosine_similarity({"a": 1}, {"a": 1}), 1.0)

if __name__ == "__main__":
    unittest.main()
