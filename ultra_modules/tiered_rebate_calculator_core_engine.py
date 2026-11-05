import logging
from typing import Dict, Any, Union

logger = logging.getLogger(__name__)

def safe_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        f_val = float(val)
        return f_val if f_val >= 0 else default
    except (ValueError, TypeError):
        return default

def safe_int(val: Any, default: int = 0) -> int:
    try:
        if val is None:
            return default
        i_val = int(val)
        return i_val if i_val >= 0 else default
    except (ValueError, TypeError):
        return default

def calculate_tiered_rebate(data: Dict[str, Any]) -> float:
    """
    Calculate the tiered rebate for a blue-collar worker.

    Expected keys in data:
    - days_worked (int): The total number of days worked (defaults to 0).
    - absent_days (int): The total number of days absent (defaults to 0).
    - rebate_rates (Dict[str, float]): A mapping of tier thresholds to rebate amounts.
      Expected keys are "7", "15", "30", "45". Defaults to 0.0 for missing.
    - daily_deduction (float): Amount to deduct per absent day (defaults to 0.0).

    Returns:
    - float: The total rebate calculated. It cannot be negative.
    """
    if not isinstance(data, dict):
        data = {}

    days_worked = safe_int(data.get("days_worked"), 0)
    absent_days = safe_int(data.get("absent_days"), 0)
    daily_deduction = safe_float(data.get("daily_deduction"), 0.0)

    rates = data.get("rebate_rates", {})
    if not isinstance(rates, dict):
        rates = {}

    tier_7_rate = safe_float(rates.get("7"), 0.0)
    tier_15_rate = safe_float(rates.get("15"), 0.0)
    tier_30_rate = safe_float(rates.get("30"), 0.0)
    tier_45_rate = safe_float(rates.get("45"), 0.0)

    rebate = 0.0

    # Base calculation based on max threshold reached
    if days_worked >= 45:
        rebate = tier_45_rate
    elif days_worked >= 30:
        rebate = tier_30_rate
    elif days_worked >= 15:
        rebate = tier_15_rate
    elif days_worked >= 7:
        rebate = tier_7_rate

    # Deductions
    total_deduction = absent_days * daily_deduction

    final_rebate = rebate - total_deduction

    return max(0.0, final_rebate)
