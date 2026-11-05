import math
import uuid
from typing import List, Dict, Any

class RebateAnomalyRadar:
    """
    蓝领阶梯返费（满7天/15天/30天/45天）到期金额与旷工扣减自动核算器
    （统计分布异常值(Z-Score/IQR)后台静默扫描与红黄绿三色极简标记器）
    """
    def __init__(self, tiers: Dict[int, float] = None, absent_deduction_rate: float = 100.0):
        if tiers is None:
            # 默认阶梯返费配置
            self.tiers = {7: 500.0, 15: 1500.0, 30: 3000.0, 45: 4500.0}
        else:
            self.tiers = tiers
        self.absent_deduction_rate = absent_deduction_rate

    def calculate_base_rebate(self, days_worked: float) -> float:
        rebate = 0.0
        # 根据出勤天数，找到满足的最高阶梯
        for days, amount in sorted(self.tiers.items()):
            if days_worked >= days:
                rebate = amount
        return rebate

    def process_records(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        processed = []

        # 第一阶段: 脏数据自愈与基础核算 (正常 GREEN / 自愈 YELLOW)
        for record in records:
            p_record = {"original": record.copy()}
            reasons = []
            is_yellow = False

            # 处理 worker_id
            worker_id = record.get("worker_id")
            if not worker_id:
                worker_id = f"AUTO-{uuid.uuid4().hex[:8]}"
                is_yellow = True
                reasons.append("缺失员工ID，已自动生成")
            p_record["worker_id"] = str(worker_id)

            # 处理 days_worked
            raw_days = record.get("days_worked")
            try:
                if raw_days is None:
                    raise ValueError
                days_worked = float(raw_days)
            except (ValueError, TypeError):
                days_worked = 0.0
                is_yellow = True
                reasons.append("出勤天数格式错误或缺失，已重置为默认值0")

            if days_worked < 0:
                days_worked = 0.0
                is_yellow = True
                reasons.append("出勤天数为负，已自动修复为0")

            # 处理 absent_days
            raw_absent = record.get("absent_days")
            try:
                if raw_absent is None:
                    raise ValueError
                absent_days = float(raw_absent)
            except (ValueError, TypeError):
                absent_days = 0.0
                is_yellow = True
                reasons.append("旷工天数格式错误或缺失，已重置为默认值0")

            if absent_days < 0:
                absent_days = 0.0
                is_yellow = True
                reasons.append("旷工天数为负，已自动修复为0")

            if absent_days > days_worked:
                absent_days = days_worked
                is_yellow = True
                reasons.append("旷工天数大于出勤天数，已自动截断为出勤天数")

            p_record["days_worked"] = days_worked
            p_record["absent_days"] = absent_days

            # 计算返费与扣款
            base_rebate = self.calculate_base_rebate(days_worked)
            deduction = absent_days * self.absent_deduction_rate
            final_rebate = max(0.0, base_rebate - deduction)

            p_record["base_rebate"] = base_rebate
            p_record["deduction"] = deduction
            p_record["final_rebate"] = final_rebate

            if is_yellow:
                p_record["status_color"] = "YELLOW"
                p_record["reason"] = "；".join(reasons)
            else:
                p_record["status_color"] = "GREEN"
                p_record["reason"] = "正常"

            processed.append(p_record)

        # 第二阶段: 统计分布异常值扫描 (Z-Score/IQR) -> 提取 Top 3% 标记为 RED
        if not processed:
            return processed

        n = len(processed)
        top_3_count = math.ceil(n * 0.03)

        absent_values = [r["absent_days"] for r in processed]
        mean_absent = sum(absent_values) / n
        std_absent = math.sqrt(sum((x - mean_absent) ** 2 for x in absent_values) / n) if n > 1 else 0.0

        sorted_absent = sorted(absent_values)
        q1_abs = sorted_absent[int(n * 0.25)]
        q3_abs = sorted_absent[int(n * 0.75)]
        iqr_abs = q3_abs - q1_abs

        for r in processed:
            abs_val = r["absent_days"]
            # 计算 Z-Score
            z_score = abs(abs_val - mean_absent) / std_absent if std_absent > 0 else 0.0
            # 计算 IQR 偏离
            iqr_dev = max(0.0, abs_val - (q3_abs + 1.5 * iqr_abs))

            # 综合异常得分
            r["_anomaly_score"] = z_score + (iqr_dev / max(1.0, iqr_abs) if iqr_abs > 0 else iqr_dev)

        # 根据异常得分降序排列
        sorted_by_anomaly = sorted(processed, key=lambda x: x["_anomaly_score"], reverse=True)

        red_marked = 0
        for r in sorted_by_anomaly:
            # 必须超过一定的阈值 (Z-Score 或 IQR 偏离明显) 才算做真正的异常
            if red_marked < top_3_count and r["_anomaly_score"] > 1.0:
                r["status_color"] = "RED"
                old_reason = r["reason"]
                anomaly_reason = f"【需人工关注】旷工天数({r['absent_days']}天)异常偏高(Z-Score/IQR偏离明显)"
                if old_reason != "正常":
                    r["reason"] = f"{anomaly_reason}；{old_reason}"
                else:
                    r["reason"] = anomaly_reason
                red_marked += 1

            # 清理辅助字段
            if "_anomaly_score" in r:
                del r["_anomaly_score"]

        return processed
