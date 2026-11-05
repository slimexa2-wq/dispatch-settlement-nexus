import unittest
import decimal
from datetime import date
from typing import Dict, Any

from ultra_modules.four_way_commission_auditor_benchmark_suite import FourWayCommissionAuditor, BenchmarkSuite

class TestFourWayCommissionAuditor(unittest.TestCase):

    def setUp(self):
        self.auditor = FourWayCommissionAuditor()

    def test_normal_payload(self):
        """Test case 1: Normal processing with all parameters provided cleanly."""
        payload = {
            'sales_amount': decimal.Decimal('10000.00'),
            'current_date': '2024-05-15',
            'salary_data': {
                'base_salary': decimal.Decimal('5000.00')
            },
            'attendance_data': {
                'absent_days': 0,
                'total_days': 30
            },
            'policy_data': {
                'multiplier': decimal.Decimal('1.0'),
                'commission_rate': decimal.Decimal('0.10'),
                'tax_rate': decimal.Decimal('0.10')
            },
            'last_month_data': {
                'pending_adjustment': decimal.Decimal('200.00')
            }
        }

        result = self.auditor.audit(payload)

        self.assertEqual(result['status'], 'success')
        # Base: 5000
        # Deduction: 0
        # Gross Comm: 10000 * 0.1 * 1.0 = 1000
        # Adj: 200
        # Bonus: 5000 * 0.05 = 250
        # Taxable: 5000 - 0 + 1000 + 200 + 250 = 6450
        # Tax: 6450 * 0.10 = 645
        # Net payout: 6450 - 645 = 5805
        self.assertEqual(result['audited_payout'], '5805.00')
        self.assertEqual(result['breakdown']['attendance_bonus'], '250.00')

    def test_dirty_data_self_healing(self):
        """Test case 2: Dirty data self-healing (garbage strings, bad types)."""
        # Patch date.today to a safe date for determinism
        import unittest.mock as mock

        class MockDate(date):
            @classmethod
            def today(cls):
                return date(2024, 5, 15)

        with mock.patch('ultra_modules.four_way_commission_auditor_benchmark_suite.date', MockDate):
            payload = {
                'sales_amount': ' $10,000.50 abc', # Dirty money string
                'current_date': 'invalid-date', # Bad date
                'attendance_data': {
                    'absent_days': 'None', # String instead of int
                'total_days': -5 # Invalid negative
            },
                'policy_data': {
                    'multiplier': ' 2.0x ',
                    'tax_rate': 1.5 # Invalid over 100%
                }
            }

            result = self.auditor.audit(payload)

            self.assertEqual(result['status'], 'success')
        # Sales: 10000.50
        # Default Base: 3000
        # Attendance: Absent: 0, Total: 0 (default fallback) -> deduction: 0
        # Multiplier: 2.0
        # Comm rate: 0.05
        # Gross Comm: 10000.50 * 0.05 * 2.0 = 1000.05
        # Taxable: 3000 + 1000.05 + 150(Bonus) = 4150.05
        # Tax Rate: self-healed to 1.0
        # Tax: 4150.05 * 1.0 = 4150.05
        # Net: 0
        # Guarantee: 3000 * 0.5 = 1500
        self.assertEqual(result['audited_payout'], '1500.00')
        self.assertEqual(result['breakdown']['tax'], '4150.05')

    def test_missing_parameter_fallback(self):
        """Test case 3: Zero-parameter/missing-parameter fallback."""
        import unittest.mock as mock

        class MockDate(date):
            @classmethod
            def today(cls):
                return date(2024, 5, 15)

        with mock.patch('ultra_modules.four_way_commission_auditor_benchmark_suite.date', MockDate):
            result = self.auditor.audit({})

            self.assertEqual(result['status'], 'success')
        # Empty payload:
        # Base: 3000
        # Sales: 0
        # Absent: 0, Total: 30 -> deduction: 0
        # Bonus: 3000 * 0.05 = 150
        # Taxable = 3150
        # Tax = 3150 * 0.10 = 315
        # Net = 2835
        # Guarantee = 1500. Not applied since 2835 > 1500
        self.assertEqual(result['audited_payout'], '2835.00')

    def test_cross_year_month_boundaries(self):
        """Test case 4: Cross-year/month boundaries (December multiplier, January carryover)."""
        # December Test
        payload_dec = {
            'sales_amount': decimal.Decimal('10000.00'),
            'current_date': '2023-12-15',
            'policy_data': {
                'multiplier': decimal.Decimal('1.0'),
                'commission_rate': decimal.Decimal('0.10')
            }
        }
        result_dec = self.auditor.audit(payload_dec)

        # Gross Comm: 10000 * 0.10 * 1.5 = 1500 (1.5x multiplier for Dec)
        self.assertEqual(result_dec['breakdown']['gross_commission'], '1500.00')

        # January Test
        payload_jan = {
            'sales_amount': decimal.Decimal('0.00'),
            'current_date': '2024-01-15'
        }
        result_jan = self.auditor.audit(payload_jan)

        # January carryover adds 1% to net payout
        # Base: 3000, Taxable: 3150, Tax: 315, Net: 2835
        # Carryover: 2835 * 1.01 = 2863.35
        self.assertEqual(result_jan['audited_payout'], '2863.35')

    def test_extreme_concurrency_benchmark(self):
        """Test case 5: Extreme concurrency limit/benchmark to verify millisecond-level responsiveness."""
        benchmark_result = BenchmarkSuite.run_benchmark(concurrency=2000)

        self.assertEqual(benchmark_result['total_processed'], 2000)
        self.assertEqual(benchmark_result['successful_processed'], 2000)
        self.assertTrue(benchmark_result['pass'], f"Benchmark failed: {benchmark_result}")

        # Verify sub-5ms response per record
        self.assertLess(benchmark_result['avg_time_per_record_ms'], 5.0)

if __name__ == '__main__':
    unittest.main()
