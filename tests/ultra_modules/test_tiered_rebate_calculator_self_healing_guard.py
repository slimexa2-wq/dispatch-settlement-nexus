import unittest
import time
from ultra_modules.tiered_rebate_calculator_self_healing_guard import TieredRebateCalculator

class TestTieredRebateCalculator(unittest.TestCase):
    def setUp(self):
        self.calculator = TieredRebateCalculator()

    def test_normal_calculation(self):
        """Test standard calculation across different tiers without absenteeism."""
        # Tier 0 (<7 days)
        res_tier0 = self.calculator.calculate_rebate({"worker_id": "W1", "days_worked": 5})
        self.assertEqual(res_tier0["tier_multiplier"], 0.0)
        self.assertEqual(res_tier0["final_rebate"], 50.0) # 5 * 10

        # Tier 1 (7-14 days)
        res_tier1 = self.calculator.calculate_rebate({"worker_id": "W2", "days_worked": 10})
        self.assertEqual(res_tier1["tier_multiplier"], 1.0)
        self.assertEqual(res_tier1["final_rebate"], 200.0) # 10 * 10 + 100

        # Tier 2 (15-29 days)
        res_tier2 = self.calculator.calculate_rebate({"worker_id": "W3", "days_worked": 20})
        self.assertEqual(res_tier2["tier_multiplier"], 1.2)
        self.assertEqual(res_tier2["final_rebate"], 440.0) # 200 + 200*1.2

        # Tier 3 (30-44 days)
        res_tier3 = self.calculator.calculate_rebate({"worker_id": "W4", "days_worked": 40})
        self.assertEqual(res_tier3["tier_multiplier"], 1.5)
        self.assertEqual(res_tier3["final_rebate"], 1000.0) # 400 + 400*1.5

        # Tier 4 (>=45 days)
        res_tier4 = self.calculator.calculate_rebate({"worker_id": "W5", "days_worked": 50})
        self.assertEqual(res_tier4["tier_multiplier"], 2.0)
        self.assertEqual(res_tier4["final_rebate"], 1500.0) # 500 + 500*2.0

    def test_absenteeism_deduction(self):
        """Test calculation with absenteeism deductions."""
        res = self.calculator.calculate_rebate({"worker_id": "W1", "days_worked": 20, "absenteeism_days": 2})
        # base: 20*10 = 200, tier bonus: 200*1.2=240, total: 440
        # deduction: 2*50 = 100
        # final: 340
        self.assertEqual(res["deduction"], 100.0)
        self.assertEqual(res["final_rebate"], 340.0)

    def test_dirty_data_self_healing(self):
        """Test silent self-healing for invalid data types and formats."""
        res = self.calculator.calculate_rebate({
            "worker_id": 12345, # Int instead of string
            "days_worked": "30.5", # String instead of float
            "absenteeism_days": None, # None type
            "base_rebate_rate": "invalid", # Invalid string
            "deduction_per_absent_day": -10 # Negative value
        })
        self.assertEqual(res["worker_id"], "12345")
        self.assertEqual(res["days_worked"], 30.5)
        self.assertEqual(res["absenteeism_days"], 0.0) # Should default to 0
        self.assertEqual(res["base_rebate"], 305.0) # default rate 10 applied
        # Default deduction is 50. Negative deduction gets max(0, -10) = 0.
        self.assertEqual(res["deduction"], 0.0)

    def test_missing_parameters(self):
        """Test default fallback when parameters are entirely missing."""
        res = self.calculator.calculate_rebate({})
        self.assertEqual(res["worker_id"], "unknown_worker")
        self.assertEqual(res["days_worked"], 0.0)
        self.assertEqual(res["absenteeism_days"], 0.0)
        self.assertEqual(res["final_rebate"], 0.0)

    def test_extreme_boundaries(self):
        """Test with extreme numbers to ensure it doesn't break."""
        res = self.calculator.calculate_rebate({
            "worker_id": "ExtremeWorker",
            "days_worked": 1e6, # extremely large days
            "absenteeism_days": 1e5,
        })
        self.assertTrue(res["final_rebate"] >= 0)

    def test_undo_mechanism_success(self):
        """Test the 5-second undo snapshot mechanism works within the window."""
        self.calculator.calculate_rebate({"worker_id": "W-Undo-1", "days_worked": 15})
        undo_res = self.calculator.undo("W-Undo-1")
        self.assertEqual(undo_res["status"], "undone")
        self.assertEqual(undo_res["worker_id"], "W-Undo-1")

    def test_undo_mechanism_expired(self):
        """Test the 5-second undo snapshot mechanism fails after window expires."""
        self.calculator.calculate_rebate({"worker_id": "W-Undo-2", "days_worked": 15})

        # Override timestamp to simulate 6 seconds passing
        self.calculator.snapshots_timestamp["W-Undo-2"] -= 6.0

        undo_res = self.calculator.undo("W-Undo-2")
        self.assertEqual(undo_res["status"], "error")
        self.assertEqual(undo_res["message"], "Undo window expired.")

if __name__ == '__main__':
    unittest.main()
