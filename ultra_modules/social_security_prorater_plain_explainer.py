import decimal
import datetime
import calendar
from decimal import Decimal, ROUND_HALF_UP

class SocialSecurityProrater:
    """
    A highly rigorous and fault-tolerant backend module to calculate prorated social security
    and housing fund bases, translating complex calculations into plain text explanation cards.
    """

    DEFAULT_CITY_AVG_SALARY = Decimal('10000.00')
    MIN_CAP_RATIO = Decimal('0.6')
    MAX_CAP_RATIO = Decimal('3.0')

    @classmethod
    def _safe_decimal(cls, value, default=Decimal('0.00')):
        try:
            if value is None:
                return default
            d = Decimal(str(value))
            return d if d >= 0 else default
        except (ValueError, TypeError, decimal.InvalidOperation):
            return default

    @classmethod
    def _safe_date(cls, date_val, default_date):
        if not date_val:
            return default_date
        if isinstance(date_val, datetime.date):
            return date_val
        if isinstance(date_val, str):
            try:
                return datetime.datetime.strptime(date_val, '%Y-%m-%d').date()
            except ValueError:
                pass
        return default_date

    @classmethod
    def explain_proration(cls, params: dict = None) -> dict:
        if params is None:
            params = {}

        # 1. Self-healing & Missing params default fallback
        base_salary = cls._safe_decimal(params.get('base_salary'), Decimal('0.00'))
        city_avg_salary = cls._safe_decimal(params.get('city_avg_salary'), cls.DEFAULT_CITY_AVG_SALARY)

        today = datetime.date.today()
        # Default start date is first day of current month
        default_start = today.replace(day=1)
        # Default end date is last day of current month
        _, last_day = calendar.monthrange(today.year, today.month)
        default_end = today.replace(day=last_day)

        start_date = cls._safe_date(params.get('start_date'), default_start)
        end_date = cls._safe_date(params.get('end_date'), default_end)

        if end_date < start_date:
            end_date = start_date

        # Determine calculation month (use start_date's month)
        calc_year = start_date.year
        calc_month = start_date.month
        _, days_in_month = calendar.monthrange(calc_year, calc_month)

        month_start = datetime.date(calc_year, calc_month, 1)
        month_end = datetime.date(calc_year, calc_month, days_in_month)

        actual_start = max(start_date, month_start)
        actual_end = min(end_date, month_end)

        if actual_end < actual_start:
             working_days = 0
        else:
             working_days = (actual_end - actual_start).days + 1

        # Calculate caps
        min_base = (city_avg_salary * cls.MIN_CAP_RATIO).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        max_base = (city_avg_salary * cls.MAX_CAP_RATIO).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # Base before proration
        capped_full_base = max(min_base, min(base_salary, max_base)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # Proration
        proration_ratio = Decimal(str(working_days)) / Decimal(str(days_in_month))
        prorated_base = (capped_full_base * proration_ratio).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # 2. Build Explanations (The Plain Text Cards)
        explanation_markdown = f"""## 社保公积金分摊核算结果

- **基础信息**:
  - 月薪基数: {base_salary} 元
  - 城市平均工资: {city_avg_salary} 元
  - 核算月份: {calc_year}年{calc_month}月 (共{days_in_month}天)
  - 在职期间: {actual_start} 至 {actual_end} (计{working_days}天)

- **封顶保底计算**:
  - 最低基数 (60%): {min_base} 元
  - 最高基数 (300%): {max_base} 元
  - 适用全月基数: {capped_full_base} 元

- **最终结论**:
  - 分摊比例: {working_days}/{days_in_month}
  - **本月实际缴纳基数: {prorated_base} 元**
"""

        explanation_html = f"""<div class="ss-card">
  <h2>社保公积金分摊核算结果</h2>
  <ul>
    <li>月薪基数: {base_salary} 元，城市平均工资: {city_avg_salary} 元</li>
    <li>核算月份: {calc_year}年{calc_month}月 (本月{days_in_month}天，在职{working_days}天)</li>
    <li>全月基数(已限制上下限): {capped_full_base} 元</li>
    <li><strong>本月实际缴纳基数: {prorated_base} 元</strong></li>
  </ul>
</div>"""

        result_data = {
            "base_salary": str(base_salary),
            "city_avg_salary": str(city_avg_salary),
            "calc_year": calc_year,
            "calc_month": calc_month,
            "days_in_month": days_in_month,
            "working_days": working_days,
            "min_base": str(min_base),
            "max_base": str(max_base),
            "capped_full_base": str(capped_full_base),
            "prorated_base": str(prorated_base),
            "markdown_card": explanation_markdown,
            "html_card": explanation_html
        }

        return result_data
