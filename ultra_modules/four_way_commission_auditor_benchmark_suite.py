import decimal
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
import time
import copy
import re

# Set up logging for self-healing and boundary warnings
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class FourWayCommissionAuditor:
    """
    Four-way Commission Auditor for processing Salary, Attendance, Policy, and Last Month Commission.
    Implements 10 strict rules, zero-configuration fault tolerance, and self-healing.
    Uses decimal.Decimal for all financial operations.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """Zero-configuration initialization with reasonable defaults."""
        self.config = config or {}
        # Default policies if not provided
        self.default_base_salary = decimal.Decimal('3000.00')
        self.default_commission_rate = decimal.Decimal('0.05')
        self.default_tax_rate = decimal.Decimal('0.10')

    def _to_decimal(self, value: Any, default: decimal.Decimal = decimal.Decimal('0.00')) -> decimal.Decimal:
        """Self-healing conversion to decimal."""
        if value is None:
            return default
        try:
            if isinstance(value, str):
                # Clean up dirty string data (e.g., "$1,234.56" or "1234.56  ")
                clean_val = re.sub(r'[^\d.-]', '', value.strip())
                if not clean_val:
                    return default
                return decimal.Decimal(clean_val)
            return decimal.Decimal(str(value))
        except (decimal.InvalidOperation, ValueError, TypeError):
            logger.warning(f"Failed to convert {value} to decimal. Using default {default}.")
            return default

    def _to_date(self, value: Any, default: date) -> date:
        """Self-healing conversion to date."""
        if value is None:
            return default
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        try:
            if isinstance(value, str):
                # Attempt to parse common formats
                for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%Y%m%d'):
                    try:
                        return datetime.strptime(value.strip(), fmt).date()
                    except ValueError:
                        continue
            return default
        except Exception:
            return default

    def _to_int(self, value: Any, default: int = 0) -> int:
        """Self-healing conversion to integer."""
        if value is None:
            return default
        try:
            if isinstance(value, str):
                clean_val = re.sub(r'[^\d-]', '', value.strip())
                if not clean_val:
                    return default
                return int(clean_val)
            return int(value)
        except (ValueError, TypeError):
            return default

    def _apply_rule_1_base_salary(self, salary_data: Dict[str, Any]) -> decimal.Decimal:
        """Rule 1: Base salary must be a positive decimal, fallback to default if missing or invalid."""
        base = self._to_decimal(salary_data.get('base_salary'), self.default_base_salary)
        return max(base, decimal.Decimal('0.00'))

    def _apply_rule_2_attendance_deduction(self, attendance_data: Dict[str, Any], base_salary: decimal.Decimal) -> decimal.Decimal:
        """Rule 2: Deduct base salary proportional to absent days."""
        total_days = self._to_int(attendance_data.get('total_days'), 30)
        total_days = max(total_days, 1) # Prevent division by zero
        absent_days = self._to_int(attendance_data.get('absent_days'), 0)

        # Self-heal: absent days cannot exceed total days
        absent_days = min(absent_days, total_days)
        absent_days = max(absent_days, 0)

        daily_rate = base_salary / decimal.Decimal(str(total_days))
        return daily_rate * decimal.Decimal(str(absent_days))

    def _apply_rule_3_policy_multiplier(self, policy_data: Dict[str, Any], current_date: date) -> decimal.Decimal:
        """Rule 3: Apply policy multiplier, bonus multiplier for December (cross-year boundary)."""
        multiplier = self._to_decimal(policy_data.get('multiplier'), decimal.Decimal('1.00'))

        # Cross-year boundary logic: December gets a 1.5x multiplier on policies
        if current_date.month == 12:
            multiplier *= decimal.Decimal('1.50')

        return max(multiplier, decimal.Decimal('0.00'))

    def _apply_rule_4_gross_commission(self, sales: decimal.Decimal, rate: decimal.Decimal, multiplier: decimal.Decimal) -> decimal.Decimal:
        """Rule 4: Gross commission = sales * rate * multiplier."""
        return sales * rate * multiplier

    def _apply_rule_5_last_month_adjustment(self, last_month_data: Dict[str, Any]) -> decimal.Decimal:
        """Rule 5: Add or subtract last month's pending adjustments."""
        adjustment = self._to_decimal(last_month_data.get('pending_adjustment'), decimal.Decimal('0.00'))
        return adjustment

    def _apply_rule_6_taxation(self, taxable_amount: decimal.Decimal, policy_data: Dict[str, Any]) -> decimal.Decimal:
        """Rule 6: Apply taxation if taxable amount is > 0."""
        if taxable_amount <= decimal.Decimal('0.00'):
            return decimal.Decimal('0.00')

        tax_rate = self._to_decimal(policy_data.get('tax_rate'), self.default_tax_rate)
        # Self-heal: tax rate must be between 0 and 1
        tax_rate = max(decimal.Decimal('0.00'), min(tax_rate, decimal.Decimal('1.00')))

        return taxable_amount * tax_rate

    def _apply_rule_7_minimum_wage_guarantee(self, net_payout: decimal.Decimal, base_salary: decimal.Decimal) -> decimal.Decimal:
        """Rule 7: Net payout cannot fall below 50% of base salary unless extreme absence."""
        min_guarantee = base_salary * decimal.Decimal('0.50')
        return max(net_payout, min_guarantee)

    def _apply_rule_8_attendance_bonus(self, attendance_data: Dict[str, Any], base_salary: decimal.Decimal) -> decimal.Decimal:
        """Rule 8: Perfect attendance (0 absent days) gives a 5% base salary bonus."""
        absent_days = self._to_int(attendance_data.get('absent_days'), 0)
        if absent_days == 0:
            return base_salary * decimal.Decimal('0.05')
        return decimal.Decimal('0.00')

    def _apply_rule_9_cross_year_carryover(self, net_payout: decimal.Decimal, current_date: date) -> decimal.Decimal:
        """Rule 9: In January, previous year carryover (simulated here) boosts net payout by 1%."""
        if current_date.month == 1:
            return net_payout * decimal.Decimal('1.01')
        return net_payout

    def _apply_rule_10_cap_maximum(self, final_payout: decimal.Decimal) -> decimal.Decimal:
        """Rule 10: Cap maximum payout to prevent extreme outliers/errors."""
        cap = decimal.Decimal('1000000.00')
        return min(final_payout, cap)

    def audit(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main execution flow.
        Payload expects: salary_data, attendance_data, policy_data, last_month_data, current_date.
        All parameters have zero-configuration defaults and auto-healing.
        """
        # Defensive copy to avoid mutating input
        safe_payload = copy.deepcopy(payload) if payload else {}

        # Extract components with fallbacks
        salary_data = safe_payload.get('salary_data') or {}
        attendance_data = safe_payload.get('attendance_data') or {}
        policy_data = safe_payload.get('policy_data') or {}
        last_month_data = safe_payload.get('last_month_data') or {}

        current_date_val = safe_payload.get('current_date')
        current_date = self._to_date(current_date_val, date.today())

        sales_amount = self._to_decimal(safe_payload.get('sales_amount'), decimal.Decimal('0.00'))

        # Execute Rules

        # Rule 1
        base_salary = self._apply_rule_1_base_salary(salary_data)

        # Rule 2
        attendance_deduction = self._apply_rule_2_attendance_deduction(attendance_data, base_salary)

        # Rule 3
        multiplier = self._apply_rule_3_policy_multiplier(policy_data, current_date)

        # Rule 4
        commission_rate = self._to_decimal(policy_data.get('commission_rate'), self.default_commission_rate)
        gross_commission = self._apply_rule_4_gross_commission(sales_amount, commission_rate, multiplier)

        # Rule 5
        last_month_adjustment = self._apply_rule_5_last_month_adjustment(last_month_data)

        # Pre-tax calculation
        taxable_amount = base_salary - attendance_deduction + gross_commission + last_month_adjustment

        # Rule 8
        attendance_bonus = self._apply_rule_8_attendance_bonus(attendance_data, base_salary)
        taxable_amount += attendance_bonus

        # Rule 6
        tax = self._apply_rule_6_taxation(taxable_amount, policy_data)

        # Post-tax
        net_payout = taxable_amount - tax

        # Rule 7 (Only apply guarantee if absent_days < total_days/2 to prevent reward for extreme absence)
        total_days = self._to_int(attendance_data.get('total_days'), 30)
        total_days = max(total_days, 1) # Prevent division by zero and negative values
        absent_days = self._to_int(attendance_data.get('absent_days'), 0)
        absent_days = min(absent_days, total_days)
        absent_days = max(absent_days, 0)
        if absent_days < total_days / 2:
            net_payout = self._apply_rule_7_minimum_wage_guarantee(net_payout, base_salary)

        # Rule 9
        net_payout = self._apply_rule_9_cross_year_carryover(net_payout, current_date)

        # Rule 10
        final_payout = self._apply_rule_10_cap_maximum(net_payout)

        # Quantize to 2 decimal places for financial precision
        final_payout = final_payout.quantize(decimal.Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)

        return {
            'status': 'success',
            'audited_payout': str(final_payout),
            'breakdown': {
                'base_salary': str(base_salary.quantize(decimal.Decimal('0.01'))),
                'attendance_deduction': str(attendance_deduction.quantize(decimal.Decimal('0.01'))),
                'gross_commission': str(gross_commission.quantize(decimal.Decimal('0.01'))),
                'last_month_adjustment': str(last_month_adjustment.quantize(decimal.Decimal('0.01'))),
                'tax': str(tax.quantize(decimal.Decimal('0.01'))),
                'attendance_bonus': str(attendance_bonus.quantize(decimal.Decimal('0.01'))),
            },
            'processed_date': current_date.isoformat()
        }


class BenchmarkSuite:
    """
    Benchmark Suite to verify extreme concurrency limits and millisecond-level responsiveness
    of the FourWayCommissionAuditor.
    """

    @staticmethod
    def generate_synthetic_fixture(size: int, dirt_factor: float = 0.1) -> List[Dict[str, Any]]:
        """
        Generates synthetic fixtures, optionally introducing dirty data (strings, none, missing keys)
        based on the dirt_factor.
        """
        import random
        fixtures = []
        for i in range(size):
            payload = {}
            is_dirty = random.random() < dirt_factor

            if is_dirty:
                payload = {
                    'sales_amount': f"${random.randint(1000, 50000)}.xyz", # Dirty money string
                    'current_date': 'invalid-date-format',
                    'attendance_data': {
                        'absent_days': 'None',
                        'total_days': -5 # Invalid negative
                    },
                    'policy_data': {
                        'multiplier': '2.0x',
                        'tax_rate': 1.5 # Invalid over 100%
                    }
                    # Missing salary_data and last_month_data entirely
                }
            else:
                # Normal boundary testing
                month = 12 if random.random() < 0.2 else 1 if random.random() < 0.2 else random.randint(2, 11)
                year = 2023 if month == 12 else 2024

                payload = {
                    'sales_amount': decimal.Decimal(str(random.randint(5000, 20000))),
                    'current_date': date(year, month, 15).isoformat(),
                    'salary_data': {
                        'base_salary': decimal.Decimal('4000.00')
                    },
                    'attendance_data': {
                        'absent_days': random.choice([0, 1, 2, 5]),
                        'total_days': 30
                    },
                    'policy_data': {
                        'multiplier': decimal.Decimal('1.2'),
                        'commission_rate': decimal.Decimal('0.08'),
                        'tax_rate': decimal.Decimal('0.15')
                    },
                    'last_month_data': {
                        'pending_adjustment': decimal.Decimal(str(random.randint(-500, 500)))
                    }
                }
            fixtures.append(payload)
        return fixtures

    @staticmethod
    def run_benchmark(concurrency: int = 1000) -> Dict[str, Any]:
        """
        Simulates extreme concurrency by processing a large batch of synthetic fixtures.
        Returns benchmarking metrics.
        """
        auditor = FourWayCommissionAuditor()
        fixtures = BenchmarkSuite.generate_synthetic_fixture(concurrency, dirt_factor=0.3)

        start_time = time.perf_counter()

        # Simulate processing all fixtures
        success_count = 0
        for fixture in fixtures:
            try:
                result = auditor.audit(fixture)
                if result.get('status') == 'success':
                    success_count += 1
            except Exception as e:
                logger.error(f"Audit failed unexpectedly: {e}")

        end_time = time.perf_counter()

        total_time_ms = (end_time - start_time) * 1000
        avg_time_ms = total_time_ms / concurrency if concurrency > 0 else 0

        return {
            'total_processed': concurrency,
            'successful_processed': success_count,
            'total_time_ms': total_time_ms,
            'avg_time_per_record_ms': avg_time_ms,
            'pass': success_count == concurrency and avg_time_ms < 5.0 # Ensure sub-5ms response per record
        }
