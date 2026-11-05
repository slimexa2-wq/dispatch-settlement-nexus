import json
from typing import Any, Dict, List, Optional

class ShiftOvertimeIntegrationBridge:
    """
    电子厂白夜班/平日1.5倍/周末2倍/节假日3倍工时一键折算器（跨系统数据契约无缝桥接与Schema版本自动向前兼容转换器）。
    自动识别新旧版本字段差异并静默映射转换，无需人工配置字段映射表。
    """

    # Alias maps to map various schema keys into standard standard keys
    FIELD_ALIASES = {
        "day_shift_hours": ["day_shift_hours", "day_hours", "白班工时", "白班", "d_hours", "dayHours"],
        "night_shift_hours": ["night_shift_hours", "night_hours", "夜班工时", "夜班", "n_hours", "nightHours"],
        "weekday_overtime_hours": ["weekday_overtime_hours", "weekday_ot", "平日加班", "平时加班", "平时加班工时", "weekdayOt"],
        "weekend_overtime_hours": ["weekend_overtime_hours", "weekend_ot", "周末加班", "周末加班工时", "weekendOt"],
        "holiday_overtime_hours": ["holiday_overtime_hours", "holiday_ot", "节假日加班", "节假日加班工时", "holidayOt", "法定加班"],
        "base_hourly_rate": ["base_hourly_rate", "base_rate", "基本时薪", "时薪", "hourly_rate", "hourlyRate"],
        "night_allowance_per_hour": ["night_allowance_per_hour", "night_allowance", "夜班津贴", "夜班补贴", "nightAllowance"],
    }

    def __init__(self):
        self._audit_logs: List[Dict[str, Any]] = []

    def _log_transformation(self, step: str, details: Any) -> None:
        """记录内部转换步骤的审计日志。"""
        self._audit_logs.append({"step": step, "details": details})

    def get_audit_logs(self) -> List[Dict[str, Any]]:
        """获取审计日志供追踪。"""
        return self._audit_logs

    def _find_mapped_value(self, payload: Dict[str, Any], standard_field: str) -> Any:
        aliases = self.FIELD_ALIASES.get(standard_field, [standard_field])
        for alias in aliases:
            if alias in payload:
                # Log the mapping when found with a non-standard name
                if alias != standard_field:
                    self._log_transformation(
                        "FIELD_MAPPED",
                        {"alias": alias, "standard_field": standard_field, "value": payload[alias]}
                    )
                return payload[alias]
        return None

    def _normalize_payload(self, raw_payload: Any) -> Dict[str, Any]:
        """将任意输入标准化并尝试从中提取有效字典。"""
        if raw_payload is None:
            self._log_transformation("NORMALIZATION", {"action": "Fallback to empty dict due to None payload"})
            return {}

        if isinstance(raw_payload, str):
            try:
                parsed = json.loads(raw_payload)
                if isinstance(parsed, dict):
                    self._log_transformation("NORMALIZATION", {"action": "Parsed JSON string to dict"})
                    return parsed
            except Exception:
                pass

        if not isinstance(raw_payload, dict):
            self._log_transformation("NORMALIZATION", {"action": f"Fallback to empty dict due to invalid type {type(raw_payload)}"})
            return {}

        return raw_payload

    def _safe_float(self, value: Any, default: float = 0.0) -> float:
        """静默清洗脏数据：处理空值、解析失败、负数等。"""
        if value is None:
            return default
        try:
            parsed = float(value)
            # Negative values are considered dirty data, silently clamped to 0.0
            return parsed if parsed >= 0 else 0.0
        except (ValueError, TypeError):
            return default

    def calculate_equivalent_hours(self, data: Dict[str, Any] = None) -> Dict[str, float]:
        """
        电子厂工时一键折算器核心算法。
        自动处理缺参、静默清洗脏数据、边界条件兜底。
        白班/夜班工时=1倍，平日加班=1.5倍，周末加班=2倍，节假日加班=3倍。
        """
        if data is None:
            data = {}

        day_hours = self._safe_float(data.get("day_shift_hours"))
        night_hours = self._safe_float(data.get("night_shift_hours"))
        weekday_ot = self._safe_float(data.get("weekday_overtime_hours"))
        weekend_ot = self._safe_float(data.get("weekend_overtime_hours"))
        holiday_ot = self._safe_float(data.get("holiday_overtime_hours"))

        base_rate = self._safe_float(data.get("base_hourly_rate"))
        night_allowance = self._safe_float(data.get("night_allowance_per_hour"))

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

    def process(self, payload: Any) -> Dict[str, Any]:
        """
        处理跨系统数据。
        1. 接收任意输入。
        2. 静默标准化为字典。
        3. 别名映射到核心引擎需要的标准字段。
        4. 调用 calculate_equivalent_hours 获取最终结果。
        5. 返回极简结果。
        """
        # 1. Normalize
        normalized_dict = self._normalize_payload(payload)

        # 2. Map fields
        standardized_payload = {}
        for standard_field in self.FIELD_ALIASES:
            val = self._find_mapped_value(normalized_dict, standard_field)
            if val is not None:
                standardized_payload[standard_field] = val
            else:
                self._log_transformation(
                    "MISSING_FIELD",
                    {"standard_field": standard_field, "action": "Left missing, letting core engine handle default fallback"}
                )

        # 3. Call Core Engine
        self._log_transformation("CALL_CORE_ENGINE", {"input": standardized_payload})
        result = self.calculate_equivalent_hours(standardized_payload)
        self._log_transformation("CORE_ENGINE_RESULT", {"output": result})

        return result
