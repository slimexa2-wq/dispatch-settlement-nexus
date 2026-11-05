import math
import statistics

class AdvanceLoanDeductionGuardAnomalyRadar:
    """
    Worker Weekly Advance Loan / Living Expenses Deduction Guard Anomaly Radar.
    Provides extreme simplicity for front-end: Zero config, silent auto-fixing of dirty data.
    """
    def __init__(self, fallback_wage=3000.0, default_advance=0.0):
        self.fallback_wage = fallback_wage
        self.default_advance = default_advance

    def _clean_data(self, record):
        if not isinstance(record, dict):
            record = {}

        worker_id = str(record.get("worker_id", "UNKNOWN_WORKER"))
        if not worker_id.strip() or worker_id == "None":
            worker_id = "UNKNOWN_WORKER"

        # Clean wage
        raw_wage = record.get("monthly_wage")
        if raw_wage is None:
            wage = float(self.fallback_wage)
        else:
            try:
                wage = float(raw_wage)
                if math.isnan(wage) or wage <= 0:
                    wage = float(self.fallback_wage)
            except (ValueError, TypeError):
                wage = float(self.fallback_wage)

        # Clean advances
        raw_advances = record.get("weekly_advances")
        if raw_advances is None:
            advances = [self.default_advance]
        elif not isinstance(raw_advances, list):
            advances = [raw_advances]
        else:
            advances = raw_advances

        total_advance = 0.0
        for adv in advances:
            if adv is None:
                continue
            try:
                val = float(adv)
                if not math.isnan(val):
                    total_advance += abs(val) # automatically fix negative advances
            except (ValueError, TypeError):
                pass

        return {
            "worker_id": worker_id,
            "monthly_wage": wage,
            "total_advance": total_advance,
            "ratio": total_advance / wage
        }

    def scan(self, records):
        if not records:
            return []

        cleaned = [self._clean_data(r) for r in records]

        # Statistical distributions
        ratios = [c["ratio"] for c in cleaned]
        n = len(ratios)

        mean_ratio = statistics.mean(ratios)
        stdev_ratio = statistics.pstdev(ratios) if n > 1 else 0.0

        sorted_ratios = sorted(ratios)

        def get_percentile(data, p):
            if n == 1:
                return float(data[0])
            k = (n - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return float(data[int(k)])
            d0 = data[int(f)] * (c - k)
            d1 = data[int(c)] * (k - f)
            return float(d0 + d1)

        q1 = get_percentile(sorted_ratios, 0.25)
        q3 = get_percentile(sorted_ratios, 0.75)
        iqr = q3 - q1
        iqr_upper_bound = q3 + 1.5 * iqr

        # Determine Top 3% count
        top_3_count = max(1, math.ceil(n * 0.03))

        # Sort by ratio descending, and worker_id ascending to ensure deterministic selection
        sorted_by_ratio = sorted(cleaned, key=lambda x: (-x["ratio"], x["worker_id"]))
        top_3_worker_ids = set([x["worker_id"] for x in sorted_by_ratio[:top_3_count]])

        results = []
        for c in cleaned:
            ratio = c["ratio"]
            worker_id = c["worker_id"]

            z_score = (ratio - mean_ratio) / stdev_ratio if stdev_ratio > 0 else 0.0

            is_iqr_anomaly = ratio > iqr_upper_bound if iqr > 0 else ratio > q3

            is_top_3 = worker_id in top_3_worker_ids

            if is_top_3 and ratio > 0:
                if ratio >= 1.0:
                    color = "Red"
                    reason = f"预支金额({c['total_advance']})已达到或超过本月工资({c['monthly_wage']})，超扣风险极高！"
                elif z_score > 2.0 or is_iqr_anomaly:
                    color = "Red"
                    reason = f"预支占比({ratio:.1%})严重偏离正常水平，建议核实是否多记或错记。"
                else:
                    color = "Yellow"
                    reason = f"预支占比({ratio:.1%})处于所有人中最高的前3%，请留意后续扣款情况。"
            else:
                color = "Green"
                reason = "预支占比在正常范围内，静默放行。"

            results.append({
                "worker_id": worker_id,
                "color": color,
                "reason": reason,
                "z_score": round(z_score, 4),
                "ratio": round(ratio, 4),
                "is_iqr_anomaly": bool(is_iqr_anomaly)
            })

        return results
