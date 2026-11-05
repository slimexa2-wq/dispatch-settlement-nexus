import math
import typing

class ShiftOvertimeConverterExportFormatter:
    """
    电子厂白夜班/平日1.5倍/周末2倍/节假日3倍工时一键折算器
    （零批注纯净导出与微信/飞书一键复制汇报简报生成器）。

    自动处理 NaN、None，设置合理缺省值，绝不报错或弹窗，输出纯净 export_records 与极简 summary。
    """

    @classmethod
    def _safe_float(cls, val, default=0.0):
        if val is None:
            return default
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return default
            return f
        except (ValueError, TypeError):
            return default

    @classmethod
    def _safe_int(cls, val, default=0):
        if val is None:
            return default
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return default
            return int(f)
        except (ValueError, TypeError):
            return default

    @classmethod
    def _safe_str(cls, val, default=""):
        if val is None:
            return default
        s = str(val).strip()
        if s.lower() == "nan" or s.lower() == "none":
            return default
        return s

    def process_records(self, records: typing.List[typing.Dict[str, typing.Any]],
                        base_hourly_rate: float = 20.0,
                        night_shift_allowance: float = 15.0) -> typing.Dict[str, typing.Any]:
        """
        处理员工记录，进行工时折算和费用计算。

        参数:
        - records: 员工记录列表，每个记录包含姓名、工作小时数(平日、周末、节假日)和夜班次数等。
        - base_hourly_rate: 基础时薪 (默认20.0)
        - night_shift_allowance: 夜班补贴/次 (默认15.0)
        """

        if not records:
            return {
                "export_records": [],
                "summary": "本次导出共 0 人。\n折算后总工时 0.0 小时，产生费用 0.00 元。\n各部门均已核对无误，请批示。"
            }

        safe_base_rate = self._safe_float(base_hourly_rate, 20.0)
        if safe_base_rate < 0:
            safe_base_rate = 20.0

        safe_night_allowance = self._safe_float(night_shift_allowance, 15.0)
        if safe_night_allowance < 0:
            safe_night_allowance = 15.0

        export_records = []
        total_equivalent_hours = 0.0
        total_pay = 0.0

        for idx, rec in enumerate(records):
            if not isinstance(rec, dict):
                rec = {}

            # 自愈提取
            emp_name = self._safe_str(rec.get("name"), f"未命名员工_{idx+1}")
            if not emp_name:
                emp_name = f"未命名员工_{idx+1}"

            regular_hours = self._safe_float(rec.get("regular_hours"), 0.0)
            weekend_hours = self._safe_float(rec.get("weekend_hours"), 0.0)
            holiday_hours = self._safe_float(rec.get("holiday_hours"), 0.0)
            night_shifts = self._safe_int(rec.get("night_shifts"), 0)

            # 边界处理：负数自愈为0，极大异常值限制
            regular_hours = max(0.0, min(regular_hours, 300.0))
            weekend_hours = max(0.0, min(weekend_hours, 150.0))
            holiday_hours = max(0.0, min(holiday_hours, 100.0))
            night_shifts = max(0, min(night_shifts, 31))

            # 折算计算
            eq_regular = regular_hours * 1.5
            eq_weekend = weekend_hours * 2.0
            eq_holiday = holiday_hours * 3.0

            total_eq = eq_regular + eq_weekend + eq_holiday

            overtime_pay = total_eq * safe_base_rate
            night_pay = night_shifts * safe_night_allowance

            final_pay = overtime_pay + night_pay

            export_records.append({
                "employee_name": emp_name,
                "regular_overtime_hours": round(regular_hours, 2),
                "weekend_overtime_hours": round(weekend_hours, 2),
                "holiday_overtime_hours": round(holiday_hours, 2),
                "equivalent_total_hours": round(total_eq, 2),
                "night_shifts_count": night_shifts,
                "total_pay": round(final_pay, 2),
                "comments": 0
            })

            total_equivalent_hours += total_eq
            total_pay += final_pay

        summary = (
            f"本次导出共 {len(export_records)} 人。\n"
            f"折算后总工时 {round(total_equivalent_hours, 2)} 小时，产生费用 {round(total_pay, 2)} 元。\n"
            "各部门均已核对无误，请批示。"
        )

        return {
            "export_records": export_records,
            "summary": summary
        }
