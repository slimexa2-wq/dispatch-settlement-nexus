import math
import re

def _clean_float(val, default_val=0.0):
    """Silent dirty data cleaning and type coercion."""
    if val is None:
        return float(default_val)
    if isinstance(val, (int, float)):
        if math.isnan(val) or math.isinf(val):
            return float(default_val)
        return float(val)
    try:
        val_str = str(val).replace(',', '')
        match = re.search(r'-?\d+\.?\d*', val_str)
        if match:
            return float(match.group(0))
        return float(default_val)
    except Exception:
        return float(default_val)

def audit_commission(data: dict) -> float:
    """
    Supplier commission four-way reconciliation with 10 iron rules.

    1. Type coercion (dirty data cleaning)
    2. Missing parameter fallback
    3. Base calculation
    4. Attendance penalties
    5. Subsidies
    6. Policy multipliers
    7. Last month adjustments
    8. Max cap limits
    9. Zero floors
    10. Final rounding
    """
    if not isinstance(data, dict):
        data = {}

    # Rule 1 & 2: Missing fallback and Type coercion
    base_salary = _clean_float(data.get('base_salary'), 0.0)
    attendance_days = _clean_float(data.get('attendance_days'), 0.0)
    expected_days = _clean_float(data.get('expected_days'), 0.0)
    subsidies = _clean_float(data.get('subsidies'), 0.0)
    policy_multiplier = _clean_float(data.get('policy_multiplier'), 1.0)
    last_month_commission = _clean_float(data.get('last_month_commission'), 0.0)
    max_cap = _clean_float(data.get('max_cap'), 0.0)

    # Rule 3: Base calculation
    amount = base_salary

    # Rule 4: Attendance penalties
    if expected_days > 0:
        ratio = attendance_days / expected_days
        if ratio > 1.0:
            ratio = 1.0
        elif ratio < 0.0:
            ratio = 0.0
        amount *= ratio

    # Rule 5: Subsidies
    amount += subsidies

    # Rule 6: Policy multipliers
    if policy_multiplier < 0.0:
        policy_multiplier = 0.0
    amount *= policy_multiplier

    # Rule 7: Last month adjustments
    amount += last_month_commission

    # Rule 8: Max cap limits
    if max_cap > 0.0 and amount > max_cap:
        amount = max_cap

    # Rule 9: Zero floors
    if amount < 0.0:
        amount = 0.0

    # Rule 10: Final rounding
    return round(amount, 2)
