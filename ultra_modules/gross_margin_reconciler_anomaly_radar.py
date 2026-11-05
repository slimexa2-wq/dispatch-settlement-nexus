import math

class GrossMarginReconcilerAnomalyRadar:
    """
    Gross Margin Reconciler Anomaly Radar
    Automatically calculates net gross margin for dispatched outsourcing projects:
    receivable - (payable_base + payable_rebate + payable_commission).
    Silently scans for statistical distribution anomalies using Z-Score and IQR.
    Flags the top 3% extreme anomalies with plain text explanations.
    """

    def __init__(self):
        self.audit_log = []

    def _log_audit(self, message: str):
        self.audit_log.append(message)

    def _clean_numeric(self, value, default=0.0):
        if value is None:
            return default
        if isinstance(value, (int, float)):
            if math.isnan(value) or math.isinf(value):
                return default
            return float(value)
        if isinstance(value, str):
            clean_str = value.replace('$', '').replace(',', '').strip()
            if not clean_str:
                return default
            try:
                val = float(clean_str)
                if math.isnan(val) or math.isinf(val):
                    return default
                return val
            except ValueError:
                return default
        return default

    def process(self, records: list[dict]) -> dict:
        """
        Process a list of records.
        Each record can have: 'id', 'receivable', 'payable_base', 'payable_rebate', 'payable_commission'.
        """
        self.audit_log = []
        self._log_audit("Starting gross margin anomaly radar scan.")

        if not records:
            self._log_audit("Empty records provided.")
            return {"results": [], "audit_log": list(self.audit_log)}

        processed_records = []
        gross_margins = []

        for idx, record in enumerate(records):
            rec_id = record.get('id', f"row_{idx}")
            receivable = self._clean_numeric(record.get('receivable'))
            payable_base = self._clean_numeric(record.get('payable_base'))
            payable_rebate = self._clean_numeric(record.get('payable_rebate'))
            payable_commission = self._clean_numeric(record.get('payable_commission'))

            gross_margin = receivable - (payable_base + payable_rebate + payable_commission)

            processed_records.append({
                "id": rec_id,
                "gross_margin": gross_margin,
            })
            gross_margins.append(gross_margin)

        n = len(gross_margins)
        if n < 4:
            self._log_audit("Not enough records for distribution analysis. Marking all as normal.")
            results = []
            for pr in processed_records:
                results.append({
                    "id": pr["id"],
                    "gross_margin": pr["gross_margin"],
                    "marker": "Green",
                    "reason": "正常"
                })
            return {"results": results, "audit_log": list(self.audit_log)}

        gross_margins_sorted = sorted(gross_margins)
        mean_gm = sum(gross_margins) / n
        variance = sum((x - mean_gm) ** 2 for x in gross_margins) / n
        std_dev = math.sqrt(variance)

        def percentile(data, p):
            k = (len(data) - 1) * p
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return data[int(k)]
            d0 = data[int(f)] * (c - k)
            d1 = data[int(c)] * (k - f)
            return d0 + d1

        q1 = percentile(gross_margins_sorted, 0.25)
        q3 = percentile(gross_margins_sorted, 0.75)
        iqr = q3 - q1

        self._log_audit(f"Stats: mean={mean_gm:.2f}, std_dev={std_dev:.2f}, Q1={q1:.2f}, Q3={q3:.2f}, IQR={iqr:.2f}")

        deviations = [{"id": pr["id"], "dev": abs(pr["gross_margin"] - mean_gm)} for pr in processed_records]
        deviations.sort(key=lambda x: x["dev"], reverse=True)

        # Calculate top 3% count. Use math.ceil to ensure we at least flag the required proportion.
        # For n=100, ceil(3.0) = 3.
        top_3_count = max(1, int(math.ceil(n * 0.03)))

        anomaly_candidates = set()
        for idx in range(top_3_count):
            anomaly_candidates.add(deviations[idx]["id"])

        results = []
        for pr in processed_records:
            gm = pr["gross_margin"]
            rec_id = pr["id"]

            is_anomaly_candidate = rec_id in anomaly_candidates

            z_score = abs(gm - mean_gm) / std_dev if std_dev > 0 else 0.0
            is_iqr_outlier = (iqr > 0) and (gm < q1 - 1.5 * iqr or gm > q3 + 1.5 * iqr)

            # To be flagged, it must be in the top 3% AND mathematically significant.
            is_significant = (z_score > 1.0) or is_iqr_outlier

            if is_anomaly_candidate and is_significant:
                if z_score > 3.0 or (iqr > 0 and gm < q1 - 3.0 * iqr):
                    marker = "Red"
                    reason = f"严重异常：毛利为 {gm:.2f}，大幅偏离平均值 (Z-Score: {z_score:.2f})，需立即人工核查。"
                else:
                    marker = "Yellow"
                    reason = f"异常关注：毛利为 {gm:.2f}，存在偏离 (Z-Score: {z_score:.2f})，建议复核。"
                self._log_audit(f"Record {rec_id} flagged as {marker} anomaly: {reason}")
            else:
                marker = "Green"
                reason = "正常"

            results.append({
                "id": rec_id,
                "gross_margin": gm,
                "marker": marker,
                "reason": reason
            })

        self._log_audit("Gross margin anomaly radar scan completed.")
        return {"results": results, "audit_log": list(self.audit_log)}
