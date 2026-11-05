import math
import collections

def calculate_cosine_similarity(text1, text2):
    if not text1 and not text2:
        return 1.0
    if not text1 or not text2:
        return 0.0

    vec1 = collections.Counter(str(text1))
    vec2 = collections.Counter(str(text2))

    intersection = set(vec1.keys()) & set(vec2.keys())
    numerator = sum([vec1[x] * vec2[x] for x in intersection])

    sum1 = sum([vec1[x]**2 for x in vec1.keys()])
    sum2 = sum([vec2[x]**2 for x in vec2.keys()])
    denominator = math.sqrt(sum1) * math.sqrt(sum2)

    if not denominator:
        return 0.0
    return float(numerator) / denominator

class RadarScanner:
    def __init__(self):
        self.standard_headers = ["工号", "应发", "实发", "打卡天数"]
        self.audit_log = []

    def _log(self, message):
        self.audit_log.append(message)

    def _map_header(self, header):
        best_match = None
        best_score = 0.0
        for std in self.standard_headers:
            score = calculate_cosine_similarity(header, std)
            if score > best_score:
                best_score = score
                best_match = std

        if best_score >= 0.4:
            return best_match
        return None

    def _clean_number(self, val):
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            return float(val)

        s = str(val).strip()
        if not s:
            return 0.0

        s = s.replace('$', '').replace('¥', '').replace(',', '').replace(' ', '')
        try:
            return float(s)
        except ValueError:
            return 0.0

    def scan(self, records):
        self.audit_log = []
        if not records:
            self._log("No records provided, returning empty list.")
            return []

        if not isinstance(records, list):
            self._log("Records is not a list, returning empty list.")
            return []

        valid_records = []
        for idx, r in enumerate(records):
            if isinstance(r, dict):
                valid_records.append(r)
            else:
                self._log(f"Row {idx} is dirty/invalid, safely ignoring.")

        if not valid_records:
            return []

        all_keys = set()
        for r in valid_records:
            all_keys.update(r.keys())

        header_mapping = {}
        for k in all_keys:
            mapped = self._map_header(str(k))
            if mapped:
                header_mapping[k] = mapped
                self._log(f"Mapped header '{k}' to standard '{mapped}'.")
            else:
                self._log(f"Header '{k}' left unmapped.")

        numeric_targets = ["应发", "实发", "打卡天数"]
        columns_data = collections.defaultdict(list)

        for i, r in enumerate(valid_records):
            for k, mapped in header_mapping.items():
                if mapped in numeric_targets:
                    val = self._clean_number(r.get(k, 0))
                    columns_data[mapped].append((i, k, val))

        anomaly_scores = collections.defaultdict(dict)
        stats_info = {}
        all_deviations = []

        for col, data in columns_data.items():
            vals = [v for _, _, v in data]
            n = len(vals)

            mean = sum(vals) / n
            variance = sum((v - mean) ** 2 for v in vals) / n
            std_dev = math.sqrt(variance)

            stats_info[col] = {"mean": mean, "std_dev": std_dev}

            sorted_vals = sorted(vals)
            q1_idx = int(n * 0.25)
            q3_idx = int(n * 0.75)
            q1 = sorted_vals[q1_idx] if n > 0 else 0.0
            q3 = sorted_vals[q3_idx] if n > 0 else 0.0
            iqr = q3 - q1

            for idx, orig_key, val in data:
                z_score = abs(val - mean) / std_dev if std_dev > 0 else 0.0

                iqr_dev = 0.0
                if iqr > 0:
                    if val < q1:
                        iqr_dev = (q1 - val) / iqr
                    elif val > q3:
                        iqr_dev = (val - q3) / iqr

                deviation = max(z_score, iqr_dev)
                anomaly_scores[idx][orig_key] = {
                    "val": val,
                    "dev": deviation,
                    "mean": mean,
                    "mapped": col
                }
                all_deviations.append(deviation)

        all_deviations.sort(reverse=True)
        total_items = len(all_deviations)

        top_3_pct_count = max(1, int(math.ceil(total_items * 0.03))) if total_items > 0 else 0
        top_1_pct_count = max(1, int(math.ceil(total_items * 0.01))) if total_items > 0 else 0

        if total_items > 0 and all_deviations[0] > 0:
            threshold_yellow = all_deviations[min(top_3_pct_count - 1, total_items - 1)]
            threshold_red = all_deviations[min(top_1_pct_count - 1, total_items - 1)]
        else:
            threshold_yellow = float('inf')
            threshold_red = float('inf')

        annotated_records = []
        for i, r in enumerate(valid_records):
            new_r = dict(r)
            annotations = {}

            row_anomalies = anomaly_scores.get(i, {})
            for orig_key, info in row_anomalies.items():
                dev = info["dev"]
                val = info["val"]
                mean = info["mean"]
                mapped = info["mapped"]

                if dev >= threshold_red and dev > 0 and threshold_red != float('inf'):
                    color = "RED"
                elif dev >= threshold_yellow and dev > 0 and threshold_yellow != float('inf'):
                    color = "YELLOW"
                else:
                    color = "GREEN"

                if color in ["RED", "YELLOW"]:
                    direction = "远高于" if val > mean else "远低于"
                    reason = f"【{mapped}】数值({val}) {direction} 整体平均水平({mean:.2f})，偏离度异常！"
                    annotations[orig_key] = {"color": color, "reason": reason}
                    self._log(f"Row {i} column '{orig_key}' flagged {color}: {reason}")
                else:
                    annotations[orig_key] = {"color": "GREEN", "reason": "正常范围内，静默放行。"}

            if annotations:
                new_r["_anomalies"] = annotations

            annotated_records.append(new_r)

        return annotated_records
