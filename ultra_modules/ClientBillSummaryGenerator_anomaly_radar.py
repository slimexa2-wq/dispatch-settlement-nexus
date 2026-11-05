import math
import statistics

class ClientBillSummaryGenerator:
    """
    甲方用工单位月度结算确认单一键生成器
    包含工时明细、管理费、税费计算
    使用 Z-Score/IQR 统计分布异常值后台静默扫描与红黄绿三色极简标记器
    """

    def __init__(self):
        pass

    def generate(self, raw_items):
        audit_log = []

        def log(msg):
            audit_log.append(msg)

        log("开始生成结算单，执行后台静默扫描...")

        if not raw_items:
            log("输入数据为空，直接返回空结果。")
            return {"items": [], "audit_log": audit_log}

        clean_items = []
        for i, item in enumerate(raw_items):
            try:
                # 1. 零配置容错与缺参自动设合理默认值
                emp_id = str(item.get("employee_id", f"EMP-UNKNOWN-{i}") or f"EMP-UNKNOWN-{i}")
                emp_name = str(item.get("employee_name", f"未知员工-{i}") or f"未知员工-{i}")

                # 数据自愈：将无效值转为安全的浮点数，并取绝对值防范负数
                def to_safe_float(val, default=0.0):
                    if val is None or val == "":
                        return default
                    try:
                        return abs(float(val))
                    except (ValueError, TypeError):
                        return default

                work_hours = to_safe_float(item.get("work_hours"), 0.0)
                hourly_rate = to_safe_float(item.get("hourly_rate"), 0.0)
                management_fee = to_safe_float(item.get("management_fee"), 0.0)
                tax_rate = to_safe_float(item.get("tax_rate"), 0.0)

                # 限制税率在合理范围 (0~100%)，防极端异常
                if tax_rate > 1.0:
                    log(f"员工 {emp_id} 税率异常 ({tax_rate})，自动规整为小数形式。")
                    tax_rate = tax_rate / 100.0

                # 计算公式：工时金额 = 工时 * 费率
                work_amount = work_hours * hourly_rate
                # 税费 = (工时总计 + 管理费) * 税率
                taxes = (work_amount + management_fee) * tax_rate
                total_amount = work_amount + management_fee + taxes

                clean_items.append({
                    "original_index": i,
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "work_hours": work_hours,
                    "hourly_rate": hourly_rate,
                    "management_fee": management_fee,
                    "tax_rate": tax_rate,
                    "work_amount": work_amount,
                    "taxes": taxes,
                    "total_amount": total_amount,
                    "status_color": "GREEN",
                    "anomaly_reason": ""
                })
                log(f"成功处理并清洗数据: {emp_id} - {emp_name}")
            except Exception as e:
                # 脏数据自愈极简兜底，确保0崩溃
                log(f"极端脏数据崩溃自愈，行 {i} 使用系统默认值。错误信息: {str(e)}")
                clean_items.append({
                    "original_index": i,
                    "employee_id": f"EMP-ERROR-{i}",
                    "employee_name": "数据解析异常",
                    "work_hours": 0.0,
                    "hourly_rate": 0.0,
                    "management_fee": 0.0,
                    "tax_rate": 0.0,
                    "work_amount": 0.0,
                    "taxes": 0.0,
                    "total_amount": 0.0,
                    "status_color": "GREEN",
                    "anomaly_reason": ""
                })

        n = len(clean_items)
        if n > 0:
            totals = [x["total_amount"] for x in clean_items]

            # 使用 IQR 和 Z-Score 混合分析，找出分布异常
            mean = statistics.mean(totals)
            pstdev = statistics.pstdev(totals) if n > 1 else 0.0

            q1, median, q3 = 0.0, 0.0, 0.0
            iqr = 0.0
            if n >= 4:
                try:
                    quantiles = statistics.quantiles(totals, n=4)
                    q1, median, q3 = quantiles[0], quantiles[1], quantiles[2]
                    iqr = q3 - q1
                except Exception:
                    median = statistics.median(totals)
            else:
                median = statistics.median(totals)

            for item in clean_items:
                val = item["total_amount"]
                # 异常打分机制：Z-score + IQR超出距离
                z_score = abs(val - mean) / pstdev if pstdev > 0 else 0.0
                iqr_dist = 0.0
                if iqr > 0:
                    if val > q3:
                        iqr_dist = (val - q3) / iqr
                    elif val < q1:
                        iqr_dist = (q1 - val) / iqr

                item["_anomaly_score"] = z_score + iqr_dist

            # 按异常得分降序
            sorted_items = sorted(clean_items, key=lambda x: x["_anomaly_score"], reverse=True)

            # 取 Top 3% 异常 (最少高亮1个，除非全体得分极低)
            target_count = math.ceil(n * 0.03)
            flagged = 0

            for i, item in enumerate(sorted_items):
                # 只有真正偏离的项才告警，设定极小的阈值(防全等数据被标红)
                if flagged < target_count and item["_anomaly_score"] > 0.01:
                    if flagged < math.ceil(target_count / 2):
                        item["status_color"] = "RED"
                        level_str = "极度"
                    else:
                        item["status_color"] = "YELLOW"
                        level_str = "显著"

                    diff = item["total_amount"] - median
                    direction = "偏高" if diff > 0 else "偏低"
                    item["anomaly_reason"] = f"大白话说明：该条结算金额（{item['total_amount']:.2f}）{direction}，偏离群体中位数（{median:.2f}）{level_str}，建议抽查确认。"
                    log(f"扫描到异常 ({item['status_color']}): {item['employee_id']} - 得分 {item['_anomaly_score']:.2f}")
                    flagged += 1
                else:
                    item["status_color"] = "GREEN"
                    item["anomaly_reason"] = "数据正常，无需关注"

            # 恢复原序并清理中间状态
            clean_items.sort(key=lambda x: x["original_index"])
            for item in clean_items:
                del item["original_index"]
                del item["_anomaly_score"]

        log("后台静默扫描与打分完成。生成净结果。")
        return {
            "items": clean_items,
            "audit_log": audit_log
        }
