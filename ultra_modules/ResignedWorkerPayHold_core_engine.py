def _clean_float(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Remove common currency symbols, spaces, and commas
        cleaned = ''.join(c for c in value if c.isdigit() or c == '.' or c == '-')
        try:
            return float(cleaned)
        except ValueError:
            return default
    return default

def _clean_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes', 'y', 't')
    return default

def calculate_resigned_worker_pay(
    base_salary=None,
    deduction_requested=None,
    is_abrupt_resignation=None,
    max_deduction_rate=None
):
    """
    Calculates the final pay and compliance deduction for resigned workers (e.g. abrupt resignation / absenteeism).
    Features auto-defaulting, dirty data silent cleaning, and compliance cap.
    """
    # Auto-defaulting and dirty data cleaning
    base_salary_clean = max(0.0, _clean_float(base_salary, 0.0))
    deduction_requested_clean = max(0.0, _clean_float(deduction_requested, 0.0))
    is_abrupt = _clean_bool(is_abrupt_resignation, False)

    # max_deduction_rate default to 0.2 (20%) if missing or invalid, bounded between 0 and 1
    rate_clean = _clean_float(max_deduction_rate, 0.2)
    if rate_clean < 0.0 or rate_clean > 1.0:
        rate_clean = 0.2

    actual_deduction = 0.0
    max_deduction_cap = 0.0

    if is_abrupt:
        max_deduction_cap = base_salary_clean * rate_clean
        actual_deduction = min(deduction_requested_clean, max_deduction_cap)

    final_pay = base_salary_clean - actual_deduction

    return {
        "base_salary": base_salary_clean,
        "is_abrupt_resignation": is_abrupt,
        "requested_deduction": deduction_requested_clean,
        "compliance_cap": max_deduction_cap,
        "actual_deduction": actual_deduction,
        "final_pay": final_pay
    }
