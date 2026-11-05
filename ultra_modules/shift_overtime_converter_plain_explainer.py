import json

class ShiftOvertimeConverterPlainExplainer:
    def __init__(self):
        pass

    def _safe_float(self, value, default=0.0):
        if value is None:
            return default
        try:
            val = float(value)
            return max(0.0, val) # Prevent negative values
        except (ValueError, TypeError):
            # Extract digits if it's a string like "10 hours"
            if isinstance(value, str):
                import re
                match = re.search(r'-?\d+(\.\d+)?', value)
                if match:
                    return max(0.0, float(match.group()))
            return default

    def explain(self, data: dict) -> dict:
        data = data or {}

        base_salary = self._safe_float(data.get('base_salary', 0.0))
        hourly_wage = self._safe_float(data.get('hourly_wage', 0.0))

        regular_ot_hours = self._safe_float(data.get('regular_ot_hours', 0.0))
        weekend_ot_hours = self._safe_float(data.get('weekend_ot_hours', 0.0))
        holiday_ot_hours = self._safe_float(data.get('holiday_ot_hours', 0.0))

        night_shift_days = self._safe_float(data.get('night_shift_days', 0.0))
        white_shift_days = self._safe_float(data.get('white_shift_days', 0.0))

        night_shift_allowance = self._safe_float(data.get('night_shift_allowance', 0.0))
        white_shift_allowance = self._safe_float(data.get('white_shift_allowance', 0.0))

        regular_ot_pay = regular_ot_hours * hourly_wage * 1.5
        weekend_ot_pay = weekend_ot_hours * hourly_wage * 2.0
        holiday_ot_pay = holiday_ot_hours * hourly_wage * 3.0

        night_shift_total = night_shift_days * night_shift_allowance
        white_shift_total = white_shift_days * white_shift_allowance

        total_pay = base_salary + regular_ot_pay + weekend_ot_pay + holiday_ot_pay + night_shift_total + white_shift_total

        summary = f"您的总收入为 {total_pay:.2f} 元。"
        details = []
        if base_salary > 0:
            details.append(f"基本工资：{base_salary:.2f} 元")
        if regular_ot_pay > 0:
            details.append(f"平日加班（1.5倍）：{regular_ot_hours:g} 小时，共 {regular_ot_pay:.2f} 元")
        if weekend_ot_pay > 0:
            details.append(f"周末加班（2倍）：{weekend_ot_hours:g} 小时，共 {weekend_ot_pay:.2f} 元")
        if holiday_ot_pay > 0:
            details.append(f"节假日加班（3倍）：{holiday_ot_hours:g} 小时，共 {holiday_ot_pay:.2f} 元")
        if night_shift_total > 0:
            details.append(f"夜班津贴：{night_shift_days:g} 天，共 {night_shift_total:.2f} 元")
        if white_shift_total > 0:
            details.append(f"白班津贴：{white_shift_days:g} 天，共 {white_shift_total:.2f} 元")

        plain_text = summary + (" 包含：" + "，".join(details) + "。" if details else "")

        json_data = {
            "total_pay": round(total_pay, 2),
            "base_salary": round(base_salary, 2),
            "overtime_pay": {
                "regular": round(regular_ot_pay, 2),
                "weekend": round(weekend_ot_pay, 2),
                "holiday": round(holiday_ot_pay, 2)
            },
            "allowances": {
                "night_shift": round(night_shift_total, 2),
                "white_shift": round(white_shift_total, 2)
            },
            "summary": plain_text
        }

        markdown_card = f"### 工资单结算摘要\n\n**{summary}**\n\n"
        for detail in details:
            markdown_card += f"- {detail}\n"

        html_card = f'<div class="salary-card">\n  <h3>工资单结算摘要</h3>\n  <p><strong>{summary}</strong></p>\n  <ul>\n'
        for detail in details:
            html_card += f'    <li>{detail}</li>\n'
        html_card += '  </ul>\n</div>'

        return {
            "json_card": json_data,
            "markdown_card": markdown_card,
            "html_card": html_card
        }
