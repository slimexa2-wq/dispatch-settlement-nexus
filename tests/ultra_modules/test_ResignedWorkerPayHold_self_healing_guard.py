import unittest
import time
from decimal import Decimal
from unittest.mock import patch
from ultra_modules.ResignedWorkerPayHold_self_healing_guard import ResignedWorkerPayHoldGuard

class TestResignedWorkerPayHoldGuard(unittest.TestCase):

    def setUp(self):
        self.guard = ResignedWorkerPayHoldGuard()

    def test_normal_case_calculations(self):
        """Test 1: Normal case calculations with valid data."""
        # 3000 base salary, 10 days worked. Earned: 3000 / 21.75 * 10 ≈ 1379.3103...
        # Requested penalty: 100
        # 20% of earned ≈ 275.86. So 100 penalty is fully allowed.
        result = self.guard.calculate_settlement(
            worker_id="W001",
            base_salary="3000.00",
            days_worked="10.00",
            penalty_requested="100.00"
        )
        self.assertEqual(result["worker_id"], "W001")
        self.assertEqual(result["base_salary"], "3000.00")
        self.assertEqual(result["days_worked"], "10.00")

        # 3000 / 21.75 * 10 = 1379.31
        self.assertEqual(result["earned_pay"], "1379.31")
        self.assertEqual(result["requested_penalty"], "100.00")
        self.assertEqual(result["actual_penalty"], "100.00")
        self.assertEqual(result["final_pay"], "1279.31")

    def test_dirty_data_self_healing(self):
        """Test 2: Dirty data self-healing (strings with text, negative values, etc.)."""
        # base_salary: has letters -> should extract numeric part "4500.50"
        # days_worked: negative value "-5" -> should self-heal to "0.00"
        # penalty: weird string "deduct 500" -> should extract "500"
        result = self.guard.calculate_settlement(
            worker_id="W002",
            base_salary="Base is 4500.50 USD",
            days_worked="-5",
            penalty_requested="deduct 500"
        )

        self.assertEqual(result["worker_id"], "W002")
        self.assertEqual(result["base_salary"], "4500.50")
        self.assertEqual(result["days_worked"], "0.00")
        self.assertEqual(result["earned_pay"], "0.00")
        self.assertEqual(result["requested_penalty"], "500.00")

        # Earned is 0, so 20% is 0. Actual penalty must be 0.
        self.assertEqual(result["actual_penalty"], "0.00")
        self.assertEqual(result["final_pay"], "0.00")

    def test_missing_params_fallback(self):
        """Test 3: Missing parameters fallback (no kwargs provided)."""
        result = self.guard.calculate_settlement()

        self.assertEqual(result["worker_id"], "UNKNOWN")
        self.assertEqual(result["base_salary"], "3000.00")
        self.assertEqual(result["days_worked"], "0.00")
        self.assertEqual(result["earned_pay"], "0.00")
        self.assertEqual(result["requested_penalty"], "0.00")
        self.assertEqual(result["actual_penalty"], "0.00")
        self.assertEqual(result["final_pay"], "0.00")

    def test_extreme_boundaries(self):
        """Test 4: Extreme boundaries (e.g., massive penalty requests, >31 work days)."""
        # requested penalty is HUGE. Max allowed should cap at 20% of earned pay.
        # days worked is > 31. Should cap at 31.
        result = self.guard.calculate_settlement(
            worker_id="W003",
            base_salary="21750.00", # Easy math: daily rate = 1000
            days_worked="45",      # Cap at 31
            penalty_requested="999999.00"
        )

        self.assertEqual(result["worker_id"], "W003")
        self.assertEqual(result["base_salary"], "21750.00")
        self.assertEqual(result["days_worked"], "31.00")
        self.assertEqual(result["earned_pay"], "31000.00") # 1000 * 31
        self.assertEqual(result["requested_penalty"], "999999.00")

        # Max penalty is 20% of 31000 = 6200
        self.assertEqual(result["actual_penalty"], "6200.00")
        self.assertEqual(result["final_pay"], "24800.00") # 31000 - 6200

    def test_5_second_undo_mechanism(self):
        """Test 5: The 5-second undo snapshot mechanism."""
        # Action 1
        res1 = self.guard.calculate_settlement(worker_id="W1", penalty_requested="10")

        # Action 2
        res2 = self.guard.calculate_settlement(worker_id="W2", penalty_requested="20")

        # Immediate Undo should revert Action 2
        undone_res2 = self.guard.undo()
        self.assertIsNotNone(undone_res2)
        self.assertEqual(undone_res2["worker_id"], "W2")

        # Now history should only have Action 1
        # Let's mock time to simulate > 5 seconds passed
        with patch('time.time', return_value=time.time() + 6.0):
            undone_res1 = self.guard.undo()
            # Should be None because time expired
            self.assertIsNone(undone_res1)

        # Verify history is not popped if undo fails due to time
        self.assertEqual(len(self.guard._history), 1)

if __name__ == "__main__":
    unittest.main()
