import decimal
import time
import datetime
import uuid
import threading
import logging
from typing import List, Dict, Any, Optional

# Configure basic logging to suppress noisy output during benchmarking
logging.basicConfig(level=logging.ERROR)

class ClientBillSummaryGenerator:
    """
    一键生成器 (Client Bill Summary Generator)
    Extreme fault-tolerance, zero-configuration, auto-defaults for missing parameters.
    Uses decimal.Decimal for precision.
    """

    DEFAULT_MANAGEMENT_FEE_RATE = decimal.Decimal('0.05')
    DEFAULT_TAX_RATE = decimal.Decimal('0.06')

    @classmethod
    def generate(cls, client_id: Optional[str] = None,
                 billing_month: Optional[str] = None,
                 work_hours_details: Optional[List[Dict[str, Any]]] = None,
                 management_fee_rate: Any = None,
                 tax_rate: Any = None) -> Dict[str, Any]:
        """
        Generates the billing summary.
        Zero-configuration:
        - client_id defaults to 'DEFAULT_CLIENT'
        - billing_month defaults to previous month if not provided
        - work_hours_details defaults to empty if None or invalid
        - management_fee_rate/tax_rate defaults to class defaults if invalid or None
        """

        # 1. Handle missing/invalid parameters (Zero Configuration & Auto-fallbacks)
        safe_client_id = str(client_id).strip() if client_id is not None and str(client_id).strip() else "DEFAULT_CLIENT"

        if not billing_month or not isinstance(billing_month, str):
            today = datetime.date.today()
            # Calculate previous month
            first = today.replace(day=1)
            prev_month = first - datetime.timedelta(days=1)
            safe_billing_month = prev_month.strftime("%Y-%m")
        else:
            safe_billing_month = billing_month

        # Parse Rates
        safe_management_fee_rate = cls._parse_decimal(management_fee_rate, cls.DEFAULT_MANAGEMENT_FEE_RATE)
        safe_tax_rate = cls._parse_decimal(tax_rate, cls.DEFAULT_TAX_RATE)

        # 2. Dirty Data Self-healing & Filtering for work_hours_details
        processed_details = []
        total_hours = decimal.Decimal('0')
        total_base_amount = decimal.Decimal('0')

        if isinstance(work_hours_details, list):
            for detail in work_hours_details:
                if not isinstance(detail, dict):
                    continue

                # Extract and clean data
                worker_name = str(detail.get('worker_name', 'Unknown Worker')).strip()
                # Filter garbled strings (simplified approach: ensure it's printable or just fallback)
                if not worker_name or not worker_name.isprintable():
                    worker_name = "Unknown Worker"

                hours = cls._parse_decimal(detail.get('hours'), decimal.Decimal('0'))
                hourly_rate = cls._parse_decimal(detail.get('hourly_rate'), decimal.Decimal('0'))

                # Prevent negative values just in case
                hours = max(decimal.Decimal('0'), hours)
                hourly_rate = max(decimal.Decimal('0'), hourly_rate)

                if hours > 0 and hourly_rate > 0:
                    amount = hours * hourly_rate
                    processed_details.append({
                        'worker_name': worker_name,
                        'hours': str(hours),
                        'hourly_rate': str(hourly_rate),
                        'amount': str(amount)
                    })
                    total_hours += hours
                    total_base_amount += amount

        # 3. Calculate Management Fee and Taxes
        management_fee = total_base_amount * safe_management_fee_rate
        subtotal_before_tax = total_base_amount + management_fee
        tax_amount = subtotal_before_tax * safe_tax_rate
        total_bill_amount = subtotal_before_tax + tax_amount

        # 4. Return minimalist result
        return {
            'bill_id': str(uuid.uuid4()),
            'client_id': safe_client_id,
            'billing_month': safe_billing_month,
            'total_workers': len(processed_details),
            'total_hours': str(total_hours),
            'total_base_amount': str(total_base_amount),
            'management_fee_rate': str(safe_management_fee_rate),
            'management_fee': str(management_fee),
            'subtotal_before_tax': str(subtotal_before_tax),
            'tax_rate': str(safe_tax_rate),
            'tax_amount': str(tax_amount),
            'total_bill_amount': str(total_bill_amount),
            'details': processed_details,
            'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

    @staticmethod
    def _parse_decimal(value: Any, default: decimal.Decimal) -> decimal.Decimal:
        if value is None:
            return default
        try:
            if isinstance(value, float):
                # Using string conversion to avoid float representation issues in Decimal
                value = str(value)
            parsed = decimal.Decimal(value)
            if parsed.is_nan() or parsed.is_infinite():
                return default
            return parsed
        except (decimal.InvalidOperation, TypeError, ValueError):
            return default


class BenchmarkSuite:
    """
    Synthetic Fixtures Generator and High-Concurrency Performance Benchmark
    """

    @classmethod
    def generate_synthetic_fixtures(cls, count: int) -> List[Dict[str, Any]]:
        """
        Generates extreme boundary and dirty data fixtures.
        """
        import random

        fixtures = []
        for i in range(count):
            # Mix of normal and dirty records
            if i % 5 == 0:
                # Dirty record
                fixtures.append({
                    'worker_name': None, # Null value
                    'hours': "abc", # Invalid format
                    'hourly_rate': float('nan') # NaN float
                })
            elif i % 5 == 1:
                # Garbled string and negative
                fixtures.append({
                    'worker_name': "\x00\x01garbled",
                    'hours': -10,
                    'hourly_rate': "15.5"
                })
            elif i % 5 == 2:
                # Extreme boundary
                fixtures.append({
                    'worker_name': f"Worker {i}",
                    'hours': "999999999.99",
                    'hourly_rate': "999999999.99"
                })
            else:
                # Normal
                fixtures.append({
                    'worker_name': f"Worker Normal {i}",
                    'hours': round(random.uniform(1, 200), 2),
                    'hourly_rate': round(random.uniform(15, 150), 2)
                })
        return fixtures

    @classmethod
    def run_benchmark(cls, concurrent_requests: int = 100, fixtures_per_req: int = 50) -> Dict[str, Any]:
        """
        Runs high concurrency benchmark.
        """
        results = []
        errors = []

        def task():
            try:
                fixtures = cls.generate_synthetic_fixtures(fixtures_per_req)
                start_time = time.perf_counter()
                res = ClientBillSummaryGenerator.generate(
                    client_id=f"CLIENT_{uuid.uuid4().hex[:8]}",
                    billing_month="2099-13", # Boundary month
                    work_hours_details=fixtures,
                    management_fee_rate="invalid_rate", # Will fallback
                    tax_rate=None # Will fallback
                )
                end_time = time.perf_counter()
                results.append((end_time - start_time) * 1000) # ms
            except Exception as e:
                errors.append(str(e))

        threads = []
        start_total = time.perf_counter()

        for _ in range(concurrent_requests):
            t = threading.Thread(target=task)
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        end_total = time.perf_counter()

        total_time_ms = (end_total - start_total) * 1000
        avg_response_time = sum(results) / len(results) if results else 0
        max_response_time = max(results) if results else 0

        return {
            'total_requests': concurrent_requests,
            'successful_requests': len(results),
            'failed_requests': len(errors),
            'total_time_ms': total_time_ms,
            'avg_response_time_ms': avg_response_time,
            'max_response_time_ms': max_response_time,
            'errors': errors[:5] # Sample of errors if any
        }
