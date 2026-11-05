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

def bridge_rebate_data(data: Any) -> Dict[str, Any]:
    """
    Silently maps legacy or non-standard rebate data formats to the standard schema.
    Provides dirty data self-healing, zero-configuration field mapping, and fallback defaults.
    """
    if not isinstance(data, dict):
        return {}

    # Try getting the field from its standard name, then fallback to aliases
    days_worked = data.get("days_worked")
    if days_worked is None:
        days_worked = data.get("working_days_total")
        if days_worked is None:
            days_worked = data.get("total_days_worked")

    absent_days = data.get("absent_days")
    if absent_days is None:
        absent_days = data.get("leave_days")
        if absent_days is None:
            absent_days = data.get("absent_total")

    daily_deduction = data.get("daily_deduction")
    if daily_deduction is None:
        daily_deduction = data.get("penalty_per_day")
        if daily_deduction is None:
            daily_deduction = data.get("deduction_amount")

    # Process rebate_rates / tiers
    rebate_rates = data.get("rebate_rates")
    if rebate_rates is None or not isinstance(rebate_rates, dict):
        legacy_tiers = data.get("tiers")
        if isinstance(legacy_tiers, dict):
            rebate_rates = legacy_tiers
        else:
            rebate_rates = {}

    standardized_data = {
        "days_worked": days_worked,
        "absent_days": absent_days,
        "daily_deduction": daily_deduction,
        "rebate_rates": rebate_rates
    }
    return standardized_data

def calculate_rebate_from_legacy(data: Any) -> float:
    """
    Entry point for the tiered rebate calculator integration bridge.
    Transforms data using bridge_rebate_data and performs the rebate calculation independently.
    """
    standard_data = bridge_rebate_data(data)

    days_worked = safe_int(standard_data.get("days_worked"), 0)
    absent_days = safe_int(standard_data.get("absent_days"), 0)
    daily_deduction = safe_float(standard_data.get("daily_deduction"), 0.0)

    rates = standard_data.get("rebate_rates")
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
