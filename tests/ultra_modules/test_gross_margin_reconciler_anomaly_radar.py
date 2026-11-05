import unittest
from ultra_modules.gross_margin_reconciler_anomaly_radar import GrossMarginReconcilerAnomalyRadar

class TestGrossMarginReconcilerAnomalyRadar(unittest.TestCase):
    def setUp(self):
        self.radar = GrossMarginReconcilerAnomalyRadar()

    def test_normal_case_green_release(self):
        # 97% normal data silently passed
        # Generate 100 records
        records = []
        for i in range(100):
            records.append({
                "id": f"rec_{i}",
                "receivable": 1000,
                "payable_base": 500,
                "payable_rebate": 100,
                "payable_commission": 50
            })

        result = self.radar.process(records)
        self.assertEqual(len(result["results"]), 100)

        # All should be green because there's no variation (all same)
        for r in result["results"]:
            self.assertEqual(r["marker"], "Green")
            self.assertEqual(r["gross_margin"], 350.0)

    def test_dirty_data_self_healing(self):
        # Invalid types, string numbers, dollar signs
        records = [
            {"id": "r1", "receivable": "$1,000", "payable_base": " 500 ", "payable_rebate": 100, "payable_commission": 50},
            {"id": "r2", "receivable": "invalid", "payable_base": None, "payable_rebate": 0, "payable_commission": 0},
            {"id": "r3", "receivable": float('nan'), "payable_base": float('inf'), "payable_rebate": 0, "payable_commission": 0},
            {"id": "r4", "receivable": "", "payable_base": 100, "payable_rebate": 10, "payable_commission": 10},
        ]

        result = self.radar.process(records)
        self.assertEqual(len(result["results"]), 4)

        # r1: 1000 - (500 + 100 + 50) = 350
        self.assertEqual(result["results"][0]["gross_margin"], 350.0)
        # r2: 0 - (0 + 0 + 0) = 0
        self.assertEqual(result["results"][1]["gross_margin"], 0.0)
        # r3: 0 - (0 + 0 + 0) = 0
        self.assertEqual(result["results"][2]["gross_margin"], 0.0)
        # r4: 0 - (100 + 10 + 10) = -120
        self.assertEqual(result["results"][3]["gross_margin"], -120.0)

    def test_missing_parameters_fallback(self):
        # Missing fields default to 0
        records = [
            {"id": "r1", "receivable": 1000},
            {"id": "r2"},
            {"id": "r3", "payable_base": 500},
            {"id": "r4", "receivable": 1000, "payable_commission": 50},
        ]

        result = self.radar.process(records)

        self.assertEqual(result["results"][0]["gross_margin"], 1000.0)
        self.assertEqual(result["results"][1]["gross_margin"], 0.0)
        self.assertEqual(result["results"][2]["gross_margin"], -500.0)
        self.assertEqual(result["results"][3]["gross_margin"], 950.0)

    def test_top_3_percent_anomaly_highlight(self):
        # Explicitly checks that top 3% extreme values get Red/Yellow
        # Generate 100 records
        records = []
        for i in range(97):
            records.append({
                "id": f"rec_{i}",
                "receivable": 1000,
                "payable_base": 500,
                "payable_rebate": 100,
                "payable_commission": 50
            })

        # Add 3 extreme anomalies (Top 3%)
        # 1 extreme high (Red)
        records.append({
            "id": "extreme_high",
            "receivable": 100000,
            "payable_base": 500,
            "payable_rebate": 100,
            "payable_commission": 50
        })

        # 2 moderate anomalies (Yellow)
        records.append({
            "id": "moderate_low_1",
            "receivable": -10000,
            "payable_base": 500,
            "payable_rebate": 100,
            "payable_commission": 50
        })

        records.append({
            "id": "moderate_low_2",
            "receivable": -15000,
            "payable_base": 500,
            "payable_rebate": 100,
            "payable_commission": 50
        })

        result = self.radar.process(records)
        self.assertEqual(len(result["results"]), 100)

        green_count = 0
        red_count = 0
        yellow_count = 0

        for r in result["results"]:
            if r["marker"] == "Green":
                green_count += 1
            elif r["marker"] == "Red":
                red_count += 1
            elif r["marker"] == "Yellow":
                yellow_count += 1

        # With 100 items, top 3% count is 3.
        # The 3 anomalies are mathematically significant (large Z-Scores/IQR deviation).
        # We expect the 3 anomalies to be flagged (at least Yellow, some might be Red).
        self.assertEqual(green_count, 97)
        self.assertEqual(red_count + yellow_count, 3)

    def test_extreme_boundaries(self):
        # Empty lists, all zeros, extreme large numbers

        # 1. Empty lists
        res1 = self.radar.process([])
        self.assertEqual(len(res1["results"]), 0)
        self.assertEqual(len(res1["audit_log"]), 2)

        # 2. Less than 4 records (no stats possible)
        res2 = self.radar.process([
            {"id": "1", "receivable": 1000},
            {"id": "2", "receivable": 2000},
            {"id": "3", "receivable": 3000}
        ])
        for r in res2["results"]:
            self.assertEqual(r["marker"], "Green")

        # 3. All zeros
        res3 = self.radar.process([
            {"id": "1", "receivable": 0},
            {"id": "2", "receivable": 0},
            {"id": "3", "receivable": 0},
            {"id": "4", "receivable": 0}
        ])
        for r in res3["results"]:
            self.assertEqual(r["marker"], "Green")
            self.assertEqual(r["gross_margin"], 0.0)

        # 4. Extreme large numbers
        records = []
        for i in range(30):
            records.append({
                "id": f"rec_{i}",
                "receivable": 1e12,
                "payable_base": 5e11,
                "payable_rebate": 1e11,
                "payable_commission": 5e10
            })

        # Add 1 anomaly
        records.append({
            "id": "anomaly",
            "receivable": 1e15,
            "payable_base": 0,
            "payable_rebate": 0,
            "payable_commission": 0
        })

        res4 = self.radar.process(records)

        anomaly = next(r for r in res4["results"] if r["id"] == "anomaly")
        self.assertIn(anomaly["marker"], ["Red", "Yellow"])

if __name__ == '__main__':
    unittest.main()
