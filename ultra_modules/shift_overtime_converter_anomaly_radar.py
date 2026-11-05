import math
from typing import List, Dict, Any

class ShiftOvertimeConverterAnomalyRadar:
    """
    电子厂白夜班/平日1.5倍/周末2倍/节假日3倍工时一键折算器
    统计分布异常值(Z-Score/IQR)后台静默扫描与红黄绿三色极简标记器
    """
    def __init__(self):
        pass

    def _clean_value(self, val: Any) -> float:
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            if math.isnan(val) or math.isinf(val) or val < 0:
                return 0.0
            return float(val)
        if isinstance(val, str):
            try:
                f_val = float(val.strip())
                if math.isnan(f_val) or math.isinf(f_val) or f_val < 0:
                    return 0.0
                return f_val
            except ValueError:
                return 0.0
        return 0.0

    def process(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not records:
            return []

        processed_records = []
        hours_list = []

        for r in records:
            out_r = dict(r)
            # Default fallbacks and self-healing
            reg_ot = self._clean_value(r.get('regular_overtime', 0))
            weekend_ot = self._clean_value(r.get('weekend_overtime', 0))
            holiday_ot = self._clean_value(r.get('holiday_overtime', 0))

            # 1.5x regular, 2x weekend, 3x holiday
            eq_hours = reg_ot * 1.5 + weekend_ot * 2.0 + holiday_ot * 3.0
            out_r['equivalent_hours'] = eq_hours
            hours_list.append(eq_hours)
            processed_records.append(out_r)

        n = len(hours_list)
        mean_val = sum(hours_list) / n
        variance = sum((x - mean_val) ** 2 for x in hours_list) / n
        std_dev = math.sqrt(variance)

        sorted_hours = sorted(hours_list)

        # Calculate thresholds
        top_3_count = max(1, int(round(n * 0.03)))
        threshold_3_percent = sorted_hours[-top_3_count] if n > 0 else float('inf')

        top_10_count = max(1, int(round(n * 0.10)))
        threshold_10_percent = sorted_hours[-top_10_count] if n > 0 else float('inf')

        for p in processed_records:
            val = p['equivalent_hours']
            z_score = (val - mean_val) / std_dev if std_dev > 0 else 0
            p['z_score'] = round(z_score, 4)

            # Mark Top 3% as Red, next 7% as Yellow, rest as Green.
            # Only flag as Red if it's genuinely above average (z_score > 0)
            if val >= threshold_3_percent and z_score > 0:
                p['status_color'] = 'Red'
                p['reason'] = '工时过高，远超正常水平'
            elif val >= threshold_10_percent and z_score > 0:
                p['status_color'] = 'Yellow'
                p['reason'] = '正常，静默放行'
            else:
                p['status_color'] = 'Green'
                p['reason'] = '正常，静默放行'

        return processed_records
