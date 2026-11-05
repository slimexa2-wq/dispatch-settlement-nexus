from typing import Any, Dict

def calculate_equivalent_hours(data: Dict[str, Any] = None) -> Dict[str, float]:
    """
    电子厂工时一键折算器核心纯函数算法。
    自动处理缺参、静默清洗脏数据、边界条件兜底。
    白班/夜班工时=1倍，平日加班=1.5倍，周末加班=2倍，节假日加班=3倍。
    """
    if data is None:
        data = {}

    def safe_float(value: Any, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            parsed = float(value)
            # Negative values are considered dirty data, silently clamped to 0.0
            return parsed if parsed >= 0 else 0.0
        except (ValueError, TypeError):
            return default

    day_hours = safe_float(data.get("day_shift_hours"))
    night_hours = safe_float(data.get("night_shift_hours"))
    weekday_ot = safe_float(data.get("weekday_overtime_hours"))
    weekend_ot = safe_float(data.get("weekend_overtime_hours"))
    holiday_ot = safe_float(data.get("holiday_overtime_hours"))

    base_rate = safe_float(data.get("base_hourly_rate"))
    night_allowance = safe_float(data.get("night_allowance_per_hour"))

    # Convert to equivalent standard hours
    ot_equivalent_hours = (weekday_ot * 1.5) + (weekend_ot * 2.0) + (holiday_ot * 3.0)
    total_equivalent_hours = day_hours + night_hours + ot_equivalent_hours

    # Calculate payouts
    base_pay = total_equivalent_hours * base_rate
    night_pay = night_hours * night_allowance
    total_pay = base_pay + night_pay

    return {
        "clean_day_shift_hours": day_hours,
        "clean_night_shift_hours": night_hours,
        "clean_weekday_ot_hours": weekday_ot,
        "clean_weekend_ot_hours": weekend_ot,
        "clean_holiday_ot_hours": holiday_ot,
        "total_equivalent_hours": total_equivalent_hours,
        "total_pay": round(total_pay, 2)
    }
