import math
from typing import Dict, Any, Union

def _safe_float(val: Any, default: float = 0.0) -> float:
    """Silently convert dirty data into float."""
    try:
        if val is None:
            return default
        if isinstance(val, (int, float)):
            if math.isnan(val) or math.isinf(val):
                return default
            return float(val)
        if isinstance(val, str):
            val = val.replace(',', '').strip()
            return float(val)
    except Exception:
        pass
    return default


def calculate_proration(params: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Calculate Social Security & Housing Fund prorated amounts.

    Supports highly fault-tolerant configuration. Missing parameters are set to robust defaults.

    Args:
        params: dict of parameters including:
            - base_salary: float (default 0)
            - min_base: float (default 0)
            - max_base: float (default 9999999)
            - social_rate_employee: float (default 0)
            - social_rate_employer: float (default 0)
            - housing_rate_employee: float (default 0)
            - housing_rate_employer: float (default 0)
            - proration_rule: str ('full_month' or 'by_day', default 'full_month')
            - days_worked: int (default 21.75 - typical working days)
            - standard_working_days: float (default 21.75)
    """
    if params is None or not isinstance(params, dict):
        params = {}

    base_salary = _safe_float(params.get('base_salary'), 0.0)
    base_salary = max(0.0, base_salary)

    min_base = _safe_float(params.get('min_base'), 0.0)
    max_base = _safe_float(params.get('max_base'), 9999999.0)

    # Ensure min_base <= max_base
    if min_base > max_base:
        min_base, max_base = max_base, min_base

    # Cap base salary
    effective_base = min(max_base, max(min_base, base_salary))

    social_rate_ee = _safe_float(params.get('social_rate_employee'), 0.0)
    social_rate_er = _safe_float(params.get('social_rate_employer'), 0.0)
    housing_rate_ee = _safe_float(params.get('housing_rate_employee'), 0.0)
    housing_rate_er = _safe_float(params.get('housing_rate_employer'), 0.0)

    proration_rule = str(params.get('proration_rule', 'full_month')).strip().lower()
    if proration_rule not in ('full_month', 'by_day'):
        proration_rule = 'full_month'

    standard_days = _safe_float(params.get('standard_working_days'), 21.75)
    if standard_days <= 0:
        standard_days = 21.75

    days_worked = _safe_float(params.get('days_worked'), standard_days)
    days_worked = max(0.0, min(days_worked, standard_days))

    if proration_rule == 'by_day':
        proration_factor = days_worked / standard_days
    else: # full_month
        proration_factor = 1.0 if days_worked > 0 else 0.0

    prorated_base = effective_base * proration_factor

    social_employee_amt = round(prorated_base * social_rate_ee, 2)
    social_employer_amt = round(prorated_base * social_rate_er, 2)
    housing_employee_amt = round(prorated_base * housing_rate_ee, 2)
    housing_employer_amt = round(prorated_base * housing_rate_er, 2)

    return {
        'effective_base': round(effective_base, 2),
        'prorated_base': round(prorated_base, 2),
        'proration_factor': round(proration_factor, 4),
        'social_employee_amt': social_employee_amt,
        'social_employer_amt': social_employer_amt,
        'housing_employee_amt': housing_employee_amt,
        'housing_employer_amt': housing_employer_amt,
        'total_employee_amt': round(social_employee_amt + housing_employee_amt, 2),
        'total_employer_amt': round(social_employer_amt + housing_employer_amt, 2),
    }
