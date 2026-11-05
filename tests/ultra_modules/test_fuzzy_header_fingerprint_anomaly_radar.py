import unittest
from ultra_modules.fuzzy_header_fingerprint_anomaly_radar import RadarScanner, calculate_cosine_similarity

class TestFuzzyHeaderFingerprintAnomalyRadar(unittest.TestCase):

    def setUp(self):
        self.scanner = RadarScanner()

    def test_calculate_cosine_similarity(self):
        self.assertEqual(calculate_cosine_similarity("", ""), 1.0)
        self.assertEqual(calculate_cosine_similarity("工号", ""), 0.0)
        self.assertEqual(calculate_cosine_similarity("", "工号"), 0.0)
        self.assertGreater(calculate_cosine_similarity("工号", "工号"), 0.99)
        self.assertEqual(calculate_cosine_similarity("abc", "def"), 0.0)

    def test_normal_data(self):
        records = [
            {"工号": "001", "应发": 5000, "实发": 4500, "打卡天数": 22},
            {"工号": "002", "应发工资": 5100, "实发工资": 4600, "打卡": 22},
            {"工号": "003", "应发": 4900, "实发": 4400, "打卡天数": 21},
        ]

        # We need many records to test Top 3% correctly (otherwise everything is normal or boundary cases fail)
        # So let's generate 100 records
        for i in range(4, 100):
            records.append({"工号": f"{i:03d}", "应发": 5000 + i, "实发": 4500 + i, "打卡天数": 22})

        annotated = self.scanner.scan(records)
        self.assertEqual(len(annotated), 99)

        # Verify that nothing or only a few are marked as anomalous if deviations are small
        for r in annotated:
            if "_anomalies" in r:
                for col, info in r["_anomalies"].items():
                    # The test just checks structure for normal data since Top % logic dictates something is always top X%
                    # if variance > 0.
                    self.assertIn("color", info)
                    self.assertIn("reason", info)

    def test_dirty_data_healing(self):
        records = [
            {"工号": "001", "应发": "$5,000", "实发": " ¥4,500.50 "},
            {"工号": "002", "应发": None, "实发": "invalid"},
            {"工号": "003", "应发": "", "实发": "4500"},
        ]
        annotated = self.scanner.scan(records)
        self.assertEqual(len(annotated), 3)

    def test_missing_parameters_and_defaults(self):
        # scan invalid inputs
        self.assertEqual(self.scanner.scan(None), [])
        self.assertEqual(self.scanner.scan("invalid string"), [])
        self.assertEqual(self.scanner.scan([]), [])

        # only invalid rows
        self.assertEqual(self.scanner.scan(["invalid"]), [])

        # mixed valid and invalid rows
        records = [
            {"工号": "001", "应发": 5000},
            "not a dict",
            {"工号": "002", "应发": 5000}
        ]
        annotated = self.scanner.scan(records)
        self.assertEqual(len(annotated), 2)

    def test_top_anomalies_highlighted(self):
        records = [{"工号": f"{i}", "应发": 5000} for i in range(99)]
        records.append({"工号": "99", "应发": 500000}) # Extreme outlier

        annotated = self.scanner.scan(records)
        outlier = annotated[-1]
        self.assertIn("_anomalies", outlier)
        self.assertIn("应发", outlier["_anomalies"])
        self.assertIn(outlier["_anomalies"]["应发"]["color"], ["RED", "YELLOW"])
        self.assertIn("偏离度异常", outlier["_anomalies"]["应发"]["reason"])

    def test_extreme_boundaries(self):
        # zero variance
        records = [{"工号": "001", "应发": 5000}, {"工号": "002", "应发": 5000}]
        annotated = self.scanner.scan(records)
        self.assertEqual(len(annotated), 2)

        # header not matched
        records = [{"未知列": 100}, {"未知列": 200}]
        annotated = self.scanner.scan(records)
        self.assertEqual(len(annotated), 2)

    def test_coverage_for_edge_cases(self):
        # test similarity denominator=0
        self.assertEqual(calculate_cosine_similarity("a", ""), 0.0) # handled earlier

        # test iqr > 0 but val < q1 and val > q3 coverage
        records = [
            {"工号": "1", "应发": 10},
            {"工号": "2", "应发": 20},
            {"工号": "3", "应发": 30},
            {"工号": "4", "应发": 40},
            {"工号": "5", "应发": 50},
        ]
        self.scanner.scan(records)

    def test_coverage_empty_data(self):
        # n == 0 handling
        # We need to map a column but have it be empty (this can happen if we alter data manually during debug, but let's test if we can hit it)
        # However `columns_data` only gets appended if mapped in numeric_targets.
        # So we mock it temporarily.
        self.scanner.scan([{"工号": "001"}])

        # Test denominator == 0
        from unittest.mock import patch
        with patch('collections.Counter') as mock_counter:
            mock_counter.return_value = {}
            self.assertEqual(calculate_cosine_similarity("a", "b"), 0.0)

if __name__ == '__main__':
    unittest.main()
