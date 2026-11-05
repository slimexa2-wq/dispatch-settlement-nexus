from typing import Any, Dict, List

def calculate_and_trace_overtime(data: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    电子厂工时一键折算器（带全链路追溯审计日志）。
    自动处理缺参、静默清洗脏数据、边界条件兜底。
    白班/夜班工时=1倍，平日加班=1.5倍，周末加班=2倍，节假日加班=3倍。
    """
    audit_trace: List[Dict[str, Any]] = []

    if data is None:
        audit_trace.append({"action": "default_initialization", "detail": "Input data is None, initialized as empty dictionary."})
        data = {}
    elif not isinstance(data, dict):
        audit_trace.append({"action": "data_type_healing", "detail": f"Input data is not a dictionary (type: {type(data).__name__}), initialized as empty dictionary."})
        data = {}

    def safe_float(key: str, value: Any, default: float = 0.0) -> float:
        if value is None:
            audit_trace.append({"action": "missing_parameter_fallback", "field": key, "detail": f"Value is None, defaulted to {default}"})
            return default
        try:
            parsed = float(value)
            if parsed < 0:
                audit_trace.append({"action": "dirty_data_clamped", "field": key, "original": parsed, "detail": f"Negative value clamped to 0.0"})
                return 0.0
            if parsed != value:
                # E.g., string parsed to float
                audit_trace.append({"action": "dirty_data_healed", "field": key, "original": value, "detail": f"Value parsed to float {parsed}"})
            return parsed
        except (ValueError, TypeError):
            audit_trace.append({"action": "dirty_data_dropped", "field": key, "original": value, "detail": f"Unparseable value dropped, defaulted to {default}"})
            return default

    # 1. Parse and heal inputs
    day_hours = safe_float("day_shift_hours", data.get("day_shift_hours"))
    night_hours = safe_float("night_shift_hours", data.get("night_shift_hours"))
    weekday_ot = safe_float("weekday_overtime_hours", data.get("weekday_overtime_hours"))
    weekend_ot = safe_float("weekend_overtime_hours", data.get("weekend_overtime_hours"))
    holiday_ot = safe_float("holiday_overtime_hours", data.get("holiday_overtime_hours"))

    base_rate = safe_float("base_hourly_rate", data.get("base_hourly_rate"))
    night_allowance = safe_float("night_allowance_per_hour", data.get("night_allowance_per_hour"))

    audit_trace.append({
        "action": "data_sanitization_complete",
        "detail": "All input values have been parsed and safely clamped."
    })

    # 2. Calculate equivalents
    weekday_ot_equiv = weekday_ot * 1.5
    weekend_ot_equiv = weekend_ot * 2.0
    holiday_ot_equiv = holiday_ot * 3.0

    ot_equivalent_hours = weekday_ot_equiv + weekend_ot_equiv + holiday_ot_equiv
    total_equivalent_hours = day_hours + night_hours + ot_equivalent_hours

    audit_trace.append({
        "action": "overtime_conversion",
        "detail": f"Converted {weekday_ot} weekday OT (1.5x), {weekend_ot} weekend OT (2x), and {holiday_ot} holiday OT (3x) into {ot_equivalent_hours} equivalent hours."
    })

    # 3. Calculate payouts
    base_pay = total_equivalent_hours * base_rate
    night_pay = night_hours * night_allowance
    total_pay = base_pay + night_pay

    audit_trace.append({
        "action": "payout_calculation",
        "detail": f"Calculated base pay {base_pay} ({total_equivalent_hours} hrs * {base_rate} rate) + night pay {night_pay} ({night_hours} hrs * {night_allowance} allowance)."
    })

    return {
        "clean_day_shift_hours": day_hours,
        "clean_night_shift_hours": night_hours,
        "clean_weekday_ot_hours": weekday_ot,
        "clean_weekend_ot_hours": weekend_ot,
        "clean_holiday_ot_hours": holiday_ot,
        "total_equivalent_hours": total_equivalent_hours,
        "total_pay": round(total_pay, 2),
        "audit_trace": audit_trace
    }
