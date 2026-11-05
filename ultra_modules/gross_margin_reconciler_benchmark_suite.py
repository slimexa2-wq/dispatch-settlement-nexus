import decimal
import time
import random
import math
from typing import List, Dict, Any, Optional

class GrossMarginReconcilerBenchmarkSuite:
    """
    Gross Margin Reconciler Benchmark Suite.
    Focuses on calculating net gross margin for dispatch outsourcing projects:
    Net Gross Margin = Invoice Amount (应收开票) - Equal Pay (同工同酬) - Return Fee (返费) - Recruitment Commission (自招提成)
    """

    def __init__(self):
        # Zero configuration initialization
        pass

    @staticmethod
    def _safe_decimal(value: Any) -> decimal.Decimal:
        """
        Safely convert any value to Decimal.
        Self-healing dirty data (nulls, gibberish strings, NaN, Inf, missing params).
        """
        if value is None:
            return decimal.Decimal('0.00')
        try:
            if isinstance(value, str):
                value = value.strip().replace(',', '')
                if not value:
                    return decimal.Decimal('0.00')

            # Handle float infinity and NaN
            if isinstance(value, float):
                if math.isinf(value) or math.isnan(value):
                    return decimal.Decimal('0.00')

            d = decimal.Decimal(str(value))
            if d.is_nan() or d.is_infinite():
                return decimal.Decimal('0.00')
            return d.quantize(decimal.Decimal('0.00'))
        except (decimal.InvalidOperation, TypeError, ValueError):
            return decimal.Decimal('0.00')

    def reconcile(self, invoice_amount: Any = 0, equal_pay: Any = 0, return_fee: Any = 0, recruitment_commission: Any = 0) -> decimal.Decimal:
        """
        Calculate the net gross margin with zero-config default to 0.00 for missing params.
        """
        inv = self._safe_decimal(invoice_amount)
        eq = self._safe_decimal(equal_pay)
        ret = self._safe_decimal(return_fee)
        rec = self._safe_decimal(recruitment_commission)

        net_margin = inv - eq - ret - rec
        return net_margin

    def generate_synthetic_fixtures(self, size: int = 1000) -> List[Dict[str, Any]]:
        """
        Generates large datasets containing nulls, gibberish strings, missing params,
        normal values, and cross-month/year date boundaries.
        """
        fixtures = []
        # Incorporate cross-month and cross-year boundaries for edge case testing
        dates = ['2023-12-31', '2024-01-01', '2024-02-29', '2024-03-01', 'None', 'gibberish_date']

        # We use a deterministic random seed for reproducible benchmarks
        rng = random.Random(42)

        for _ in range(size):
            scenario = rng.choice(['normal', 'missing', 'dirty', 'extreme', 'boundary'])

            if scenario == 'normal':
                fixtures.append({
                    'invoice_amount': rng.uniform(1000, 10000),
                    'equal_pay': rng.uniform(100, 1000),
                    'return_fee': rng.uniform(10, 100),
                    'recruitment_commission': rng.uniform(50, 500),
                    'date': rng.choice(dates[:4])
                })
            elif scenario == 'missing':
                fixtures.append({
                    'invoice_amount': rng.uniform(1000, 5000),
                    # intentionally missing other financial fields
                    'date': rng.choice(dates[:4])
                })
            elif scenario == 'dirty':
                fixtures.append({
                    'invoice_amount': rng.choice([None, "abc乱码", "", "   ", float('nan'), float('inf')]),
                    'equal_pay': rng.choice([None, "1,000.50", "invalid", "!!##!!"]),
                    'return_fee': None,
                    'recruitment_commission': "500",
                    'date': rng.choice(dates)
                })
            elif scenario == 'extreme':
                fixtures.append({
                    'invoice_amount': "9999999999.99",
                    'equal_pay': -500.0,
                    'return_fee': 0.00001,
                    'recruitment_commission': "99999999.99",
                    'date': '2023-12-31'
                })
            elif scenario == 'boundary':
                fixtures.append({
                    'invoice_amount': 0.0,
                    'equal_pay': 0.0,
                    'return_fee': 0.0,
                    'recruitment_commission': 0.0,
                    'date': rng.choice(['2023-12-31', '2024-01-01', '2024-02-29', '2024-03-01'])
                })
        return fixtures

    def run_benchmark(self, fixtures: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Processes the datasets, handles exceptions self-healing, calculates elapsed time,
        and returns a benchmark report validating zero crashes and millisecond-level average processing times.
        """
        start_time = time.perf_counter()

        processed_count = 0
        errors = 0
        total_margin = decimal.Decimal('0.00')

        for item in fixtures:
            try:
                # zero configuration and self healing defaulting via get()
                inv = item.get('invoice_amount')
                eq = item.get('equal_pay')
                ret = item.get('return_fee')
                rec = item.get('recruitment_commission')

                margin = self.reconcile(inv, eq, ret, rec)
                total_margin += margin
                processed_count += 1
            except Exception:
                errors += 1

        end_time = time.perf_counter()
        elapsed_time = end_time - start_time

        average_ms = (elapsed_time / max(1, processed_count)) * 1000 if processed_count > 0 else 0.0

        return {
            'total_processed': processed_count,
            'errors': errors,
            'total_margin_sum': str(total_margin),
            'elapsed_time_seconds': round(elapsed_time, 4),
            'average_time_ms': round(average_ms, 6),
            'zero_crashes': (errors == 0),
            'millisecond_responsive': (average_ms < 1.0)
        }
