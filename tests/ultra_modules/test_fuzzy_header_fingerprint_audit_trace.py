import unittest
from ultra_modules.fuzzy_header_fingerprint_audit_trace import identify_headers_with_audit, DEFAULT_TARGET_HEADERS

class TestFuzzyHeaderFingerprintAuditTrace(unittest.TestCase):
    def test_normal_execution(self):
        """Test normal execution with clear matches."""
        raw_headers = ["实发工资", "应发薪水", "打卡的天数"]
        result = identify_headers_with_audit(raw_headers)

        frontend = result['frontend_result']
        self.assertIn("实发工资", frontend)
        self.assertEqual(frontend["实发工资"], "实发工资")

        self.assertIn("应发薪水", frontend)
        # Should map to "应发工资" or something similar. Depending on similarity, it will pass the threshold.
        # "应发薪水" vs "应发工资": 应发 is in both.
        # "应发薪水" -> unigrams: 应, 发, 薪, 水; bigrams: 应发, 发薪, 薪水
        # "应发工资" -> unigrams: 应, 发, 工, 资; bigrams: 应发, 发工, 工资
        self.assertEqual(frontend["应发薪水"], "应发工资")

        self.assertIn("打卡的天数", frontend)
        self.assertEqual(frontend["打卡的天数"], "打卡天数")

        # Verify audit trace contains action finalize
        actions = [item['action'] for item in result['audit_trace']]
        self.assertIn('finalize', actions)

    def test_dirty_data_self_healing(self):
        """Test self-healing on dirty, malformed data."""
        raw_headers = [" 员 \t 工 _ 工 # 号! ", "姓__名", None, 12345]
        result = identify_headers_with_audit(raw_headers)

        frontend = result['frontend_result']
        self.assertEqual(frontend.get(" 员 \t 工 _ 工 # 号! "), "员工工号")
        self.assertEqual(frontend.get("姓__名"), "姓名")

        # 12345 shouldn't match any standard header closely enough if they are Chinese strings
        # None should be ignored.
        actions = [item['action'] for item in result['audit_trace']]
        self.assertIn('ignore_empty', actions)

    def test_missing_parameter_fallback(self):
        """Test fallback when parameters are omitted or malformed."""
        # Using default targets by passing None and invalid inputs for target_headers
        raw_headers = ["实发工资123"]
        result = identify_headers_with_audit(raw_headers, target_headers=None)

        frontend = result['frontend_result']
        self.assertEqual(frontend.get("实发工资123"), "实发工资")

        # If raw_headers is a string rather than a list
        result2 = identify_headers_with_audit("出勤天数")
        self.assertEqual(result2['frontend_result'].get("出勤天数"), "出勤天数")

    def test_deduplication_conflict_resolution(self):
        """Test deduplication logic when multiple headers map to the same target."""
        # "基本工资" and "基本工资A" will both map to "基本工资"
        # "基本工资" should have 100% similarity, "基本工资A" should be lower
        raw_headers = ["基本工资A", "基本工资"]
        result = identify_headers_with_audit(raw_headers)

        frontend = result['frontend_result']
        self.assertNotIn("基本工资A", frontend)
        self.assertIn("基本工资", frontend)
        self.assertEqual(frontend["基本工资"], "基本工资")

        actions = [item['action'] for item in result['audit_trace']]
        self.assertIn('deduplication_override', actions)

    def test_extreme_boundary_conditions(self):
        """Test extreme cases like empty strings, no matches, zero similarity."""
        raw_headers = ["", "   ", "completely_unrelated_english_string", "1", "a"]
        result = identify_headers_with_audit(raw_headers, threshold=0.99)

        frontend = result['frontend_result']
        self.assertEqual(frontend, {})

        actions = [item['action'] for item in result['audit_trace']]
        self.assertIn('ignore_empty', actions)
        self.assertIn('no_match_above_threshold', actions)

        # Empty target headers list should fallback to default
        result2 = identify_headers_with_audit(["基本工资"], target_headers=[])
        self.assertEqual(result2['frontend_result'].get("基本工资"), "基本工资")

if __name__ == '__main__':
    unittest.main()
