import concurrent.futures
import datetime
import calendar
import re

class SocialSecurityProraterBatchPipeline:
    """
    A robust pipeline to batch process social security prorating.
    It supports zero-configuration defaults, dirty data self-healing, and high-throughput execution.
    """

    DEFAULT_RATES = {
        'pension': 0.08,
        'medical': 0.02,
        'unemployment': 0.005,
        'housing_fund': 0.07,
    }
    DEFAULT_CAP = 30000.0
    DEFAULT_FLOOR = 3000.0

    def __init__(self, config=None):
        self.config = config or {}
        self.rates = self.config.get('rates', self.DEFAULT_RATES)
        self.cap = self.config.get('cap', self.DEFAULT_CAP)
        self.floor = self.config.get('floor', self.DEFAULT_FLOOR)

    def _clean_number(self, value, default=0.0):
        if value is None:
            return default
        if isinstance(value, (int, float)):
            return float(value)
        try:
            # Extract first group of numbers
            match = re.search(r'-?\d+(\.\d+)?', str(value).replace(',', ''))
            if match:
                return float(match.group(0))
            return default
        except Exception:
            return default

    def _parse_date(self, date_str):
        if not date_str:
            return None
        if isinstance(date_str, datetime.date):
            return date_str
        try:
            # Trying standard ISO format first
            if isinstance(date_str, str):
                match = re.search(r'(\d{4})[-\./](\d{1,2})[-\./](\d{1,2})', date_str)
                if match:
                    return datetime.date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
            return None
        except Exception:
            return None

    def _calculate_active_days(self, target_year, target_month, onboard_date, offboard_date):
        _, days_in_month = calendar.monthrange(target_year, target_month)

        start_day = 1
        end_day = days_in_month

        if onboard_date:
            if onboard_date.year == target_year and onboard_date.month == target_month:
                start_day = max(1, onboard_date.day)
            elif onboard_date.year > target_year or (onboard_date.year == target_year and onboard_date.month > target_month):
                return 0, days_in_month

        if offboard_date:
            if offboard_date.year == target_year and offboard_date.month == target_month:
                end_day = min(days_in_month, offboard_date.day)
            elif offboard_date.year < target_year or (offboard_date.year == target_year and offboard_date.month < target_month):
                return 0, days_in_month

        active_days = max(0, end_day - start_day + 1)
        return active_days, days_in_month

    def process_record(self, record):
        """
        Process a single employee record.
        """
        try:
            # Self-healing base extraction
            base_salary = self._clean_number(record.get('base_salary'))

            # Apply bounds
            bounded_base = max(self.floor, min(base_salary, self.cap))

            target_month_str = record.get('target_month', '2023-01')
            tm_match = re.search(r'(\d{4})[-\./](\d{1,2})', str(target_month_str))
            if tm_match:
                target_year = int(tm_match.group(1))
                target_month = int(tm_match.group(2))
            else:
                # Fallback to current year/month if completely invalid
                now = datetime.datetime.now()
                target_year = now.year
                target_month = now.month

            onboard_date = self._parse_date(record.get('onboard_date'))
            offboard_date = self._parse_date(record.get('offboard_date'))

            active_days, days_in_month = self._calculate_active_days(target_year, target_month, onboard_date, offboard_date)

            proration_ratio = active_days / days_in_month if days_in_month else 0.0

            prorated_base = bounded_base * proration_ratio

            deductions = {
                k: round(prorated_base * v, 2) for k, v in self.rates.items()
            }
            total_deduction = sum(deductions.values())

            return {
                'employee_id': record.get('employee_id', 'UNKNOWN'),
                'status': 'success',
                'active_days': active_days,
                'days_in_month': days_in_month,
                'proration_ratio': round(proration_ratio, 4),
                'bounded_base': round(bounded_base, 2),
                'prorated_base': round(prorated_base, 2),
                'deductions': deductions,
                'total_deduction': round(total_deduction, 2)
            }
        except Exception as e:
            return {
                'employee_id': record.get('employee_id', 'UNKNOWN'),
                'status': 'error',
                'error': str(e)
            }

    def process_batch(self, records, max_workers=10):
        """
        High-throughput batch processing using a thread pool.
        """
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_record = {executor.submit(self.process_record, r): r for r in records}
            for future in concurrent.futures.as_completed(future_to_record):
                results.append(future.result())
        return results
