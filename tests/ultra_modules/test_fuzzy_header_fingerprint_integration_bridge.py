import unittest
from ultra_modules.fuzzy_header_fingerprint_integration_bridge import (
    get_bigrams,
    cosine_similarity,
    FuzzyHeaderFingerprintIntegrationBridge,
    bridge_data
)

class TestFuzzyHeaderFingerprintIntegrationBridge(unittest.TestCase):

    def test_get_bigrams(self):
        self.assertEqual(get_bigrams("abc"), ["ab", "bc"])
        self.assertEqual(get_bigrams("a"), ["a"])
        self.assertEqual(get_bigrams(""), [])
        self.assertEqual(get_bigrams(None), [])

    def test_cosine_similarity(self):
        # Exact match
        self.assertAlmostEqual(cosine_similarity("应发金额", "应发金额"), 1.0)

        # Similar match
        score = cosine_similarity("应发工资", "应发金额")
        self.assertTrue(score > 0)

        # Completely different
        self.assertAlmostEqual(cosine_similarity("工号", "天数"), 0.0)

        # None or empty string cases
        self.assertEqual(cosine_similarity(None, "test"), 0.0)
        self.assertEqual(cosine_similarity("test", ""), 0.0)

    def test_bridge_data_normal_mapping(self):
        raw_data = [
            {"工号": "001", "应发金额": 5000, "实发金额": 4500, "打卡天数": 22},
            {"人员编号": "002", "基本工资": 6000, "最终实发": 5500, "出勤天数": 23}
        ]

        normalized = bridge_data(raw_data)

        self.assertEqual(len(normalized), 2)

        # Check first row
        self.assertEqual(normalized[0]['employee_id'], "001")
        self.assertEqual(normalized[0]['expected_pay'], 5000)
        self.assertEqual(normalized[0]['actual_pay'], 4500)
        self.assertEqual(normalized[0]['attendance_days'], 22)

        # Check second row
        self.assertEqual(normalized[1]['employee_id'], "002")
        self.assertEqual(normalized[1]['expected_pay'], 6000)
        self.assertEqual(normalized[1]['actual_pay'], 5500)
        self.assertEqual(normalized[1]['attendance_days'], 23)

    def test_bridge_data_dirty_self_healing(self):
        # Handle spaces, None values for keys, and completely empty keys
        raw_data = [
            {" 工号 ": "003", None: "skip_this", "   ": "skip_this_too", "应发 ": 7000}
        ]

        normalized = bridge_data(raw_data)

        self.assertEqual(len(normalized), 1)
        self.assertIn('employee_id', normalized[0])
        self.assertEqual(normalized[0]['employee_id'], "003")
        self.assertIn('expected_pay', normalized[0])
        self.assertEqual(normalized[0]['expected_pay'], 7000)
        self.assertNotIn(None, normalized[0])

    def test_bridge_data_missing_parameters_fallback(self):
        # Empty list
        self.assertEqual(bridge_data([]), [])
        self.assertEqual(bridge_data(None), [])

        # Custom schema fallback
        custom_schema = {
            'bonus': ['奖金', '提成']
        }

        raw_data = [{"提成": 1000, "工号": "001"}]
        normalized = bridge_data(raw_data, custom_schema)

        self.assertEqual(len(normalized), 1)
        self.assertEqual(normalized[0]['bonus'], 1000)
        # Without default schema, "工号" should remain unmapped
        self.assertEqual(normalized[0]['工号'], "001")

    def test_bridge_data_extreme_edge_cases(self):
        # Contains unmapped header
        raw_data = [{"未知列名": "abc", "应发": 1000}]
        normalized = bridge_data(raw_data)
        self.assertEqual(normalized[0]['未知列名'], "abc")
        self.assertEqual(normalized[0]['expected_pay'], 1000)

        # Single character headers
        raw_data2 = [{"钱": 500}]
        normalized2 = bridge_data(raw_data2)
        self.assertEqual(normalized2[0]['钱'], 500) # Unmapped

        # Invalid row types (e.g., string instead of dict)
        raw_data3 = [{"应发": 1000}, "invalid_row", {"实发": 900}]
        normalized3 = bridge_data(raw_data3)
        self.assertEqual(len(normalized3), 2)
        self.assertEqual(normalized3[0]['expected_pay'], 1000)
        self.assertEqual(normalized3[1]['actual_pay'], 900)

if __name__ == '__main__':
    unittest.main()
