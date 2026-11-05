import math
import statistics
from typing import List, Dict, Any

class SocialSecurityProraterAnomalyRadar:
    """
    五险一金跨月入离职按天/按月封顶基数自动分摊核算器
    包含统计分布异常值(Z-Score/IQR)后台静默扫描与红黄绿三色极简标记器。

    设计理念：
    1. 极简接入：缺参自动设合理默认值，容错脏数据。
    2. 严密后台：复杂 Z-Score/IQR 异常检测，并生成静默审计日志。
    3. 清晰输出：一键直达，红黄绿三色极简标记与大白话原因。
    """

    @staticmethod
    def _clean_float(val: Any, default: float) -> float:
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return float(val)
        try:
            val_str = str(val).replace(',', '').replace('￥', '').replace('¥', '').strip()
            return float(val_str)
        except (ValueError, TypeError):
            return default

    def process_batch(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        处理批量员工数据，计算分摊基数并进行异常雷达扫描。

        输入字段：
        - id: 员工唯一标识
        - name: 姓名
        - base_salary: 基础薪资 (脏数据自动容错)
        - min_cap: 当地社保最小基数，默认 3000
        - max_cap: 当地社保最大基数，默认 15000
        - month_days: 当月计薪天数，默认 21.75
        - worked_days: 实际出勤天数，默认与 month_days 一致
        """
        if not records:
            return {"processed_records": [], "audit_log": ["Empty input records. Silent return."]}

        audit_log = []
        processed = []

        for record in records:
            # 1. 脏数据自愈与缺参默认兜底
            name = record.get('name', '匿名员工')

            base_salary = self._clean_float(record.get('base_salary'), 3000.0)
            min_cap = self._clean_float(record.get('min_cap'), 3000.0)
            max_cap = self._clean_float(record.get('max_cap'), 15000.0)

            # 确保上下限合理
            if min_cap > max_cap:
                min_cap, max_cap = max_cap, min_cap

            month_days = self._clean_float(record.get('month_days'), 21.75)
            if month_days <= 0:
                month_days = 21.75

            worked_days = self._clean_float(record.get('worked_days'), month_days)
            if worked_days < 0:
                worked_days = 0.0
            if worked_days > month_days:
                worked_days = month_days

            # 2. 核心算法：按天分摊与封顶限制
            worked_ratio = worked_days / month_days
            prorated_salary = base_salary * worked_ratio

            capped_base = prorated_salary
            if capped_base < min_cap:
                capped_base = min_cap
                audit_log.append(f"[Trace] {name}: Prorated base {prorated_salary:.2f} triggered min cap {min_cap}.")
            elif capped_base > max_cap:
                capped_base = max_cap
                audit_log.append(f"[Trace] {name}: Prorated base {prorated_salary:.2f} triggered max cap {max_cap}.")

            # 构建处理后的单条数据
            processed_record = {
                **record,
                'name': name,
                '_internal_id': id(record),
                'clean_base_salary': round(base_salary, 2),
                'prorated_salary': round(prorated_salary, 2),
                'capped_base': round(capped_base, 2),
            }
            processed.append(processed_record)

        # 3. 统计分布异常值扫描 (Z-Score & IQR)
        n = len(processed)
        if n < 4:
            # 样本极小，不进行统计学过滤，直接全绿
            for rec in processed:
                rec['anomaly_color'] = 'Green'
                rec['anomaly_reason'] = '样本量过小，静默放行'
                rec.pop('_internal_id', None)
            audit_log.append("Sample size < 4. All marked Green.")
            return {"processed_records": processed, "audit_log": audit_log}

        bases = [rec['capped_base'] for rec in processed]
        mean_val = statistics.mean(bases)
        try:
            stdev_val = statistics.stdev(bases)
        except statistics.StatisticsError:
            stdev_val = 0.0

        bases_sorted = sorted(bases)
        q1 = bases_sorted[n // 4]
        q3 = bases_sorted[(n * 3) // 4]
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr

        # 评估异常程度并打分
        for rec in processed:
            val = rec['capped_base']
            z_score = abs(val - mean_val) / stdev_val if stdev_val > 0 else 0.0

            iqr_dev = 0.0
            if val < lower_bound:
                iqr_dev = lower_bound - val
            elif val > upper_bound:
                iqr_dev = val - upper_bound

            rec['_deviation_score'] = (z_score * 100) + iqr_dev
            rec['_z_score'] = z_score
            rec['_is_anomaly'] = (val < lower_bound or val > upper_bound or z_score > 2.0)

        # 排序以找出 Top 3%
        sorted_by_dev = sorted(processed, key=lambda x: x['_deviation_score'], reverse=True)
        top_3_count = max(1, math.ceil(n * 0.03))

        for i, rec in enumerate(sorted_by_dev):
            val = rec['capped_base']
            z = rec['_z_score']
            is_anomaly = rec['_is_anomaly']
            name = rec.get('name', 'Unknown')

            if is_anomaly:
                if i < top_3_count:
                    rec['anomaly_color'] = 'Red'
                    rec['anomaly_reason'] = f"严重异常：分摊基数(¥{val})偏离群体过大，请核实考勤或薪资输入"
                    audit_log.append(f"[Red Alert] {name}: Base {val} highly anomalous (Z={z:.2f}).")
                else:
                    rec['anomaly_color'] = 'Yellow'
                    rec['anomaly_reason'] = f"轻微偏差：分摊基数(¥{val})处于边缘区间，系统已自动处理并放行"
                    audit_log.append(f"[Yellow Notice] {name}: Base {val} slightly anomalous (Z={z:.2f}).")
            else:
                rec['anomaly_color'] = 'Green'
                rec['anomaly_reason'] = "数据正常，静默放行"

            # 清理临时字段
            rec.pop('_deviation_score', None)
            rec.pop('_z_score', None)
            rec.pop('_is_anomaly', None)
            rec.pop('_internal_id', None)

        return {
            "processed_records": processed,
            "audit_log": audit_log
        }
