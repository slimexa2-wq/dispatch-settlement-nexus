import unittest
import decimal
import datetime
import math
from ultra_modules.ClientBillSummaryGenerator_benchmark_suite import ClientBillSummaryGenerator, BenchmarkSuite

class TestClientBillSummaryGenerator(unittest.TestCase):

    def test_normal_operation(self):
        """1. Normal operation case with explicit parameters"""
        details = [
            {'worker_name': 'Alice', 'hours': '10', 'hourly_rate': '20'},
            {'worker_name': 'Bob', 'hours': 5.5, 'hourly_rate': 100.0},
        ]
        result = ClientBillSummaryGenerator.generate(
            client_id="CLIENT_123",
            billing_month="2023-10",
            work_hours_details=details,
            management_fee_rate="0.10",
            tax_rate="0.05"
        )

        self.assertEqual(result['client_id'], "CLIENT_123")
        self.assertEqual(result['billing_month'], "2023-10")
        self.assertEqual(result['total_workers'], 2)

        # 10*20 = 200, 5.5*100 = 550 => Total base = 750
        self.assertEqual(decimal.Decimal(result['total_base_amount']), decimal.Decimal('750'))

        # Mgmt fee = 750 * 0.10 = 75
        self.assertEqual(decimal.Decimal(result['management_fee']), decimal.Decimal('75'))

        # Subtotal = 750 + 75 = 825
        self.assertEqual(decimal.Decimal(result['subtotal_before_tax']), decimal.Decimal('825'))

        # Tax = 825 * 0.05 = 41.25
        self.assertEqual(decimal.Decimal(result['tax_amount']), decimal.Decimal('41.25'))

        # Total = 825 + 41.25 = 866.25
        self.assertEqual(decimal.Decimal(result['total_bill_amount']), decimal.Decimal('866.25'))

    def test_missing_parameters_auto_fallback(self):
        """2. Missing parameters and auto-fallback (zero configuration)"""
        # Call with literally zero configuration
        result = ClientBillSummaryGenerator.generate()

        self.assertEqual(result['client_id'], "DEFAULT_CLIENT")

        # Auto-fallback for billing month should be previous month
        today = datetime.date.today()
        first = today.replace(day=1)
        prev_month = first - datetime.timedelta(days=1)
        expected_month = prev_month.strftime("%Y-%m")
        self.assertEqual(result['billing_month'], expected_month)

        self.assertEqual(result['total_workers'], 0)
        self.assertEqual(decimal.Decimal(result['total_base_amount']), decimal.Decimal('0'))
        self.assertEqual(decimal.Decimal(result['management_fee_rate']), ClientBillSummaryGenerator.DEFAULT_MANAGEMENT_FEE_RATE)
        self.assertEqual(decimal.Decimal(result['tax_rate']), ClientBillSummaryGenerator.DEFAULT_TAX_RATE)

    def test_dirty_data_self_healing(self):
        """3. Dirty data self-healing (null values, garbled strings, invalid number formats)"""
        details = [
            None, # Null in list
            "not a dict", # Invalid type in list
            {'worker_name': None, 'hours': 'abc', 'hourly_rate': 50}, # Missing name, invalid hours
            {'worker_name': '\x00Garbled', 'hours': -10, 'hourly_rate': '20'}, # Garbled name, negative hours
            {'worker_name': 'Charlie', 'hours': math.nan, 'hourly_rate': math.inf}, # NaN and Inf floats
            {'worker_name': 'Valid', 'hours': '10', 'hourly_rate': '25'}, # Valid one amidst the chaos
        ]

        result = ClientBillSummaryGenerator.generate(
            work_hours_details=details,
            management_fee_rate="invalid", # Invalid rate
            tax_rate=None # Null rate
        )

        # Only the valid one should be processed
        self.assertEqual(result['total_workers'], 1)
        self.assertEqual(result['details'][0]['worker_name'], 'Valid')
        self.assertEqual(decimal.Decimal(result['total_base_amount']), decimal.Decimal('250'))

        # Invalid rates should fallback to defaults
        self.assertEqual(decimal.Decimal(result['management_fee_rate']), ClientBillSummaryGenerator.DEFAULT_MANAGEMENT_FEE_RATE)
        self.assertEqual(decimal.Decimal(result['tax_rate']), ClientBillSummaryGenerator.DEFAULT_TAX_RATE)

    def test_extreme_boundaries(self):
        """4. Extreme boundaries (cross-year/month periods, extremely large numbers)"""
        large_num_str = "999999999999999999.99" # 18 9s
        details = [
            {'worker_name': 'Titan', 'hours': large_num_str, 'hourly_rate': '1000'}
        ]

        result = ClientBillSummaryGenerator.generate(
            client_id="BOUNDARY_CLIENT",
            billing_month="2023-12", # December (cross year boundary check visually)
            work_hours_details=details,
            management_fee_rate="0.01",
            tax_rate="0.0" # Zero tax
        )

        expected_base = decimal.Decimal(large_num_str) * decimal.Decimal('1000')
        self.assertEqual(decimal.Decimal(result['total_base_amount']), expected_base)

        expected_mgmt_fee = expected_base * decimal.Decimal('0.01')
        self.assertEqual(decimal.Decimal(result['management_fee']), expected_mgmt_fee)

        expected_total = expected_base + expected_mgmt_fee
        self.assertEqual(decimal.Decimal(result['total_bill_amount']), expected_total)
        self.assertEqual(decimal.Decimal(result['tax_amount']), decimal.Decimal('0'))

    def test_concurrency_benchmark(self):
        """5. Concurrency benchmark (zero crashes, fast response)"""
        # Run benchmark: 100 concurrent requests, 50 synthetic fixtures each
        result = BenchmarkSuite.run_benchmark(concurrent_requests=100, fixtures_per_req=50)

        # Assert zero crashes
        self.assertEqual(result['failed_requests'], 0)
        self.assertEqual(result['successful_requests'], 100)

        # Assert reasonable performance (e.g. avg response time < 500ms)
        # Note: In constrained CI environments this might be slightly higher,
        # but for this scale using simple math it should be extremely fast.
        self.assertTrue(result['avg_response_time_ms'] < 1000,
                        f"Avg response time too slow: {result['avg_response_time_ms']}ms")

if __name__ == '__main__':
    unittest.main()
