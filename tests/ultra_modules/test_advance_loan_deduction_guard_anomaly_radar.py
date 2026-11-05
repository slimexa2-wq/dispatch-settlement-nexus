import unittest
import math
from ultra_modules.advance_loan_deduction_guard_anomaly_radar import AdvanceLoanDeductionGuardAnomalyRadar

class TestAdvanceLoanDeductionGuardAnomalyRadar(unittest.TestCase):
    def setUp(self):
        self.radar = AdvanceLoanDeductionGuardAnomalyRadar()

    def test_normal_distribution_green_yellow(self):
        """Test with normal distribution to check if top 3% goes yellow, and rest green."""
        # Need at least 34 to make 1 out of 34 be 3% (34 * 0.03 = 1.02 -> 2 top, wait ceil(34*0.03)=2).
        # Let's use 100 items for easy percentages. 3% of 100 is 3.
        records = []
        # Create a linear distribution to have a non-zero IQR
        for i in range(1, 101):
            records.append({
                "worker_id": f"W{i:03d}",
                "monthly_wage": 3000.0,
                "weekly_advances": [float(i)]
            })

        results = self.radar.scan(records)
        self.assertEqual(len(results), 100)

        green_count = sum(1 for r in results if r["color"] == "Green")
        yellow_count = sum(1 for r in results if r["color"] == "Yellow")
        red_count = sum(1 for r in results if r["color"] == "Red")

        # Top 3 are W098, W099, W100
        # They should be yellow as they don't break z-score > 2 or IQR or ratio >= 1.0
        self.assertEqual(green_count, 97)
        self.assertEqual(yellow_count, 3)
        self.assertEqual(red_count, 0)

        top_workers = sorted([r["worker_id"] for r in results if r["color"] == "Yellow"])
        self.assertEqual(top_workers, ["W098", "W099", "W100"])

    def test_extreme_over_deduction_red(self):
        """Test if advances >= wage turns Red for top anomalies."""
        records = [
            {"worker_id": "W1", "monthly_wage": 3000, "weekly_advances": 3000},
            {"worker_id": "W2", "monthly_wage": 3000, "weekly_advances": [1000, 2000, 500]},
            {"worker_id": "W3", "monthly_wage": 3000, "weekly_advances": 0}
        ]

        results = self.radar.scan(records)
        red_count = sum(1 for r in results if r["color"] == "Red")
        green_count = sum(1 for r in results if r["color"] == "Green")

        # 3 items, 3% is ceil(3*0.03)=1. Top 1 should be W2 (ratio = 3500/3000 > 1)
        # However, because both W1 and W2 are >1, let's see. Top 1 is selected based on ratio.
        # W2 ratio = 1.16, W1 ratio = 1.0. W2 is Top 1.
        self.assertEqual(red_count, 1) # W2
        self.assertEqual(green_count, 2)

        w2_res = next(r for r in results if r["worker_id"] == "W2")
        self.assertEqual(w2_res["color"], "Red")
        self.assertTrue("超扣风险极高" in w2_res["reason"])

    def test_iqr_anomaly_red(self):
        """Test IQR/Z-score anomaly Red tagging."""
        records = []
        for i in range(1, 98):
            records.append({
                "worker_id": f"W{i:03d}",
                "monthly_wage": 3000.0,
                "weekly_advances": [0.0]
            })

        # Add 3 outliers
        records.append({"worker_id": "W098", "monthly_wage": 3000.0, "weekly_advances": [0.0]})
        records.append({"worker_id": "W099", "monthly_wage": 3000.0, "weekly_advances": [10.0]})
        records.append({"worker_id": "W100", "monthly_wage": 3000.0, "weekly_advances": [2000.0]})

        results = self.radar.scan(records)

        w100 = next(r for r in results if r["worker_id"] == "W100")
        self.assertEqual(w100["color"], "Red")
        self.assertTrue("严重偏离正常水平" in w100["reason"])

    def test_dirty_data_self_healing_and_missing_params(self):
        """Test dirty data like NaN, None, missing keys, invalid types."""
        records = [
            # Missing worker_id and wage and advances
            {},
            # Invalid wage type and NaN
            {"worker_id": "W2", "monthly_wage": "ABC", "weekly_advances": [None, 100]},
            {"worker_id": "W3", "monthly_wage": float("nan"), "weekly_advances": ["invalid", 50]},
            # None type for advances and wage
            {"worker_id": None, "monthly_wage": None, "weekly_advances": None},
            # Negative advances should absolute
            {"worker_id": "W4", "monthly_wage": 3000, "weekly_advances": [-500]},
        ]

        results = self.radar.scan(records)

        self.assertEqual(len(results), 5)
        w4 = next(r for r in results if r["worker_id"] == "W4")
        self.assertEqual(w4["ratio"], round(500 / 3000, 4))

        # Checking UNKNOWN_WORKER aggregation (there are two unknown workers due to missing and None)
        # Note: They are output separately
        unknowns = [r for r in results if r["worker_id"] == "UNKNOWN_WORKER"]
        self.assertEqual(len(unknowns), 2)
        for u in unknowns:
            self.assertEqual(u["ratio"], 0.0)

    def test_empty_and_single_record(self):
        """Test empty record list and single record."""
        # Empty
        self.assertEqual(self.radar.scan([]), [])

        # Single record
        res1 = self.radar.scan([{"worker_id": "S1", "monthly_wage": 3000, "weekly_advances": 500}])
        self.assertEqual(len(res1), 1)
        self.assertEqual(res1[0]["color"], "Yellow") # Single record is always in top 3% (1 out of 1)
        self.assertEqual(res1[0]["ratio"], round(500 / 3000, 4))

if __name__ == '__main__':
    unittest.main()
