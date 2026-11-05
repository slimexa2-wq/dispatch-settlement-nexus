import time
import math
import random
import logging
from typing import Dict, Any, List, Optional, Tuple, Union
from datetime import datetime, date
import calendar

logger = logging.getLogger(__name__)

class SocialSecurityProraterBenchmark:
    """
    五险一金跨月入离职按天/按月封顶基数自动分摊核算器
    """

    def __init__(self):
        self.default_base = 3000.0  # Default fallback base
        self.cap_base = 25000.0     # Cap limit base

    def _clean_date(self, val: Any, default_val: date) -> date:
        """Silently clean dirty data to a valid date."""
        if isinstance(val, date) and not isinstance(val, datetime):
            return val
        if isinstance(val, datetime):
            return val.date()
        if isinstance(val, str):
            try:
                # Try common formats
                if 'T' in val:
                    return datetime.fromisoformat(val[:10]).date()
                return datetime.strptime(val.strip()[:10], '%Y-%m-%d').date()
            except Exception:
                pass
        return default_val

    def _clean_float(self, val: Any, default_val: float) -> float:
        """Silently clean dirty data to a valid float."""
        if isinstance(val, (int, float)):
            if math.isnan(val) or math.isinf(val):
                return default_val
            return float(val)
        if isinstance(val, str):
            try:
                # Clean currency symbols or commas
                cleaned = val.replace(',', '').replace('￥', '').replace('$', '').strip()
                result = float(cleaned)
                if math.isnan(result) or math.isinf(result):
                    return default_val
                return result
            except Exception:
                pass
        return default_val

    def calculate_proration(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate prorated social security based on input parameters.
        Returns calculated metrics.
        """
        if not isinstance(params, dict):
            params = {}

        today = date.today()

        # Clean inputs with fallbacks
        base_salary = self._clean_float(params.get('base_salary'), self.default_base)
        if base_salary <= 0:
            base_salary = self.default_base

        hire_date = self._clean_date(params.get('hire_date'), today)
        resign_date = self._clean_date(params.get('resign_date'), date(2099, 12, 31))

        # Handle illogical dates silently
        if resign_date < hire_date:
            resign_date = date(2099, 12, 31)

        target_year = params.get('target_year')
        target_month = params.get('target_month')

        try:
            target_year = int(target_year)
        except (ValueError, TypeError):
            target_year = today.year

        try:
            target_month = int(target_month)
        except (ValueError, TypeError):
            target_month = today.month

        if target_month < 1 or target_month > 12:
            target_month = today.month

        # Target month logic
        # Apply cap to base salary
        effective_base = min(base_salary, self.cap_base)

        target_start = date(target_year, target_month, 1)
        _, last_day = calendar.monthrange(target_year, target_month)
        target_end = date(target_year, target_month, last_day)

        # Check if the employee was active during the target month
        if hire_date > target_end or resign_date < target_start:
            # Not active in this month
            return {
                'active_days': 0,
                'total_days_in_month': last_day,
                'prorated_base': 0.0,
                'is_capped': False,
                'effective_base': 0.0,
                'target_year': target_year,
                'target_month': target_month
            }

        # Calculate overlapping days
        overlap_start = max(hire_date, target_start)
        overlap_end = min(resign_date, target_end)
        active_days = (overlap_end - overlap_start).days + 1

        # Proration logic
        # If active for the whole month, full base. Otherwise, prorate by days.
        if active_days >= last_day:
            prorated_base = effective_base
        else:
            prorated_base = effective_base * (active_days / last_day)

        # Round to 2 decimal places
        prorated_base = round(prorated_base, 2)

        return {
            'active_days': active_days,
            'total_days_in_month': last_day,
            'prorated_base': prorated_base,
            'is_capped': base_salary > self.cap_base,
            'effective_base': effective_base,
            'target_year': target_year,
            'target_month': target_month,
            'base_salary': base_salary
        }

    def run_benchmark(self, num_records: int = 100000) -> Dict[str, Any]:
        """
        Run a synthetic benchmark with a large number of records.
        Returns performance metrics.
        """
        start_time = time.time()

        # Generate synthetic data
        records = []
        for i in range(num_records):
            # Mix of normal, dirty, and boundary data
            if i % 10 == 0:
                # Dirty data
                records.append({
                    'base_salary': 'invalid',
                    'hire_date': '2023-13-45',
                    'target_year': None
                })
            elif i % 10 == 1:
                # Extreme boundaries / Capped
                records.append({
                    'base_salary': 999999.99,
                    'hire_date': '2023-12-31',
                    'resign_date': '2024-01-01',
                    'target_year': 2024,
                    'target_month': 1
                })
            elif i % 10 == 2:
                # Missing parameters
                records.append({})
            else:
                # Normal cases
                records.append({
                    'base_salary': random.uniform(2000, 30000),
                    'hire_date': f"2023-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
                    'target_year': 2023,
                    'target_month': random.randint(1, 12)
                })

        prep_time = time.time() - start_time

        calc_start = time.time()
        results = [self.calculate_proration(r) for r in records]
        calc_time = time.time() - calc_start

        return {
            'total_records': num_records,
            'prep_time_ms': prep_time * 1000,
            'calc_time_ms': calc_time * 1000,
            'records_per_second': num_records / calc_time if calc_time > 0 else float('inf'),
            'success_count': len(results)
        }
