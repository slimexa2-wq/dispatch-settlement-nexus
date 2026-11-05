import unittest
import datetime
import time
from ultra_modules.tiered_rebate_calculator_benchmark_suite import TieredRebateCalculator

class TestTieredRebateCalculatorBenchmarkSuite(unittest.TestCase):
    def test_normal_rebate_calculation(self):
        # 10 days effective (12 days total - 2 absent) -> should hit 7 day tier
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date=datetime.date(2023, 1, 1),
                current_date=datetime.date(2023, 1, 13),
                absent_days=2
            ),
            100.0
        )

        # 15 days effective -> should hit 15 day tier
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2023-01-01",
                current_date="2023-01-16",
                absent_days=0
            ),
            200.0
        )

        # 45 days effective -> should hit 45 day tier
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2023-01-01",
                current_date="2023-02-15",
                absent_days=0
            ),
            600.0
        )

    def test_dirty_data_parsing_healing(self):
        # absent_days is a string float
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2023-01-01",
                current_date="2023-01-11",
                absent_days="2.5"  # Should parse to 2
            ),
            100.0  # 10 - 2 = 8 effective days
        )

        # invalid string date
        # If both are invalid, they become today(). Difference is 0 days -> 0.0
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="invalid-date",
                current_date="invalid-date2",
                absent_days="abc"
            ),
            0.0
        )

        # valid and invalid mix
        # Entry is valid, current is invalid (defaults to today).
        # Today is way past 2023-01-01, so it hits max tier.
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2000-01-01",
                current_date="invalid-date2",
                absent_days=-5  # Negative absent days should parse to 0
            ),
            600.0
        )

    def test_missing_parameter_defaults(self):
        # All defaults
        # Entry/Current become today. Total days = 0.
        self.assertEqual(TieredRebateCalculator.calculate(), 0.0)

        # Passing None to explicitly test missing defaults
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date=None,
                current_date=None,
                absent_days=None,
                tiers=None
            ),
            0.0
        )

        # Malformed tiers
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2023-01-01",
                current_date="2023-01-09", # 8 days
                absent_days=None,
                tiers="this should be a list" # Falls back to default tiers
            ),
            100.0
        )

    def test_cross_year_boundary_handling(self):
        # Dec 15 to Jan 5 = 21 days
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2022-12-15",
                current_date="2023-01-05",
                absent_days=0
            ),
            200.0 # 21 days -> hits 15 day tier
        )

        # Leap year handling (Feb 28 to Mar 1 in leap year is 2 days)
        # We need 7 days. So Feb 25 to Mar 3 is 7 days.
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2024-02-25",
                current_date="2024-03-03",
                absent_days=0
            ),
            100.0
        )

        # Non-leap year handling (Feb 25 to Mar 3 is 6 days)
        # Wait, Feb 25 2023 to Mar 3 2023:
        # Feb 25 to Feb 28 is 3 days. + 3 days in March = 6 days.
        self.assertEqual(
            TieredRebateCalculator.calculate(
                entry_date="2023-02-25",
                current_date="2023-03-03",
                absent_days=0
            ),
            0.0
        )

    def test_high_concurrency_synthetic_data(self):
        # Test performance and stability over 10,000 synthetic records
        start_time = time.time()
        for i in range(10000):
            # Vary inputs somewhat to simulate synthetic data
            # Mix valid and invalid data
            if i % 3 == 0:
                TieredRebateCalculator.calculate(
                    entry_date="2023-01-01",
                    current_date=f"2023-01-{i%31+1:02d}",
                    absent_days=i%5
                )
            elif i % 3 == 1:
                TieredRebateCalculator.calculate(
                    entry_date=None,
                    current_date="invalid",
                    absent_days=str(i)
                )
            else:
                TieredRebateCalculator.calculate(
                    entry_date=datetime.date(2020, 1, 1),
                    current_date=datetime.date(2023, 1, 1),
                    tiers=[(10, 50), (30, 100)]
                )
        end_time = time.time()

        execution_time_ms = (end_time - start_time) * 1000
        # Check that 10,000 records process in a reasonable time (e.g. < 500ms)
        self.assertLess(execution_time_ms, 500.0)

if __name__ == '__main__':
    unittest.main()
