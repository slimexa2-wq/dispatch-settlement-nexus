import unittest
from datetime import date
from ultra_modules.tiered_rebate_calculator_batch_pipeline import (
    RebateRecord,
    TieredRebateCalculator,
    RebateBatchPipeline,
    process_rebate_stream
)

class TestTieredRebateCalculatorBatchPipeline(unittest.TestCase):

    def test_normal_input(self):
        """Test with normal input reaching a specific tier."""
        record = RebateRecord(
            worker_id="W001",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 31),
            days_worked=16,
            absent_days=1,
            base_rebate=100.0,
            tier_rates={7: 50.0, 15: 200.0, 30: 500.0, 45: 1000.0},
            absent_penalty_per_day=20.0
        )
        result = TieredRebateCalculator.calculate(record)
        # Expected: base(100) + tier_15(200) - absent(1 * 20) = 280
        self.assertEqual(result.final_rebate, 280.0)
        self.assertEqual(result.status, "SUCCESS")

    def test_dirty_data_self_healing(self):
        """Test with negative days and penalties to ensure self-healing (max 0)."""
        record = RebateRecord(
            worker_id="W002",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 10),
            days_worked=-5,  # should become 0
            absent_days=-2,  # should become 0
            base_rebate=-10.0, # should become 0
            tier_rates={7: 50.0, 15: 200.0},
            absent_penalty_per_day=-10.0 # should become 0
        )
        result = TieredRebateCalculator.calculate(record)
        self.assertEqual(result.final_rebate, 0.0)
        self.assertEqual(result.days_worked, 0)
        self.assertEqual(result.status, "SUCCESS")

    def test_missing_input_default_fallback(self):
        """Test when tier_rates is missing, it should use defaults."""
        record = RebateRecord(
            worker_id="W003",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 31),
            days_worked=32, # Reaches 30 days default tier
            absent_days=0,
            base_rebate=0.0
            # tier_rates omitted
        )
        result = TieredRebateCalculator.calculate(record)
        # Default tier for 30 is 300.0
        self.assertEqual(result.final_rebate, 300.0)
        self.assertEqual(result.status, "SUCCESS")

    def test_high_throughput_stream(self):
        """Test stream processing with 1000 records."""
        # Generate 1000 records
        records_data = []
        for i in range(1000):
            records_data.append({
                "worker_id": f"W_{i}",
                "days_worked": 8,  # Reaches 7 days tier
                "absent_days": 0,
                "base_rebate": 10.0,
                "tier_rates": {7: 50.0, 15: 150.0}
            })

        results = process_rebate_stream(records_data)
        self.assertEqual(len(results), 1000)

        # Check an arbitrary record
        res = results[450]
        # Expected: base(10) + tier(50) - absent(0) = 60
        self.assertEqual(res["final_rebate"], 60.0)
        self.assertEqual(res["status"], "SUCCESS")

    def test_boundary_extreme_penalty(self):
        """Test extreme penalty making rebate negative, should max to 0."""
        record = RebateRecord(
            worker_id="W004",
            start_date=date(2023, 1, 1),
            end_date=date(2023, 1, 10),
            days_worked=8, # reaches 7 days (50)
            absent_days=2,
            base_rebate=0.0,
            tier_rates={7: 50.0},
            absent_penalty_per_day=100.0 # 2 * 100 = 200 penalty
        )
        result = TieredRebateCalculator.calculate(record)
        # Expected: 50 - 200 = -150 -> max(0, -150) -> 0
        self.assertEqual(result.final_rebate, 0.0)
        self.assertEqual(result.status, "SUCCESS")

if __name__ == "__main__":
    unittest.main()
