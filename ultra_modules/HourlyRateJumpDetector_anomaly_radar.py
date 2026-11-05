import datetime
import math
from typing import List, Dict, Any

class HourlyRateAnomalyRadar:
    """
    Core algorithm module for detecting hourly rate jump anomalies.
    Provides data self-healing, missing parameter fallbacks, statistical anomaly detection
    using robust measures like Interquartile Range (IQR), and policy boundary checks.
    Silently generates full-link traceable audit logs.
    Automatically highlights top 3% anomalies (approximate) and categorizes entries
    with simple Red/Yellow/Green markers for frontend simplicity.
    """

    def __init__(self):
        self.audit_log: List[Dict[str, Any]] = []

    def _log(self, action: str, details: Any):
        """Silently logs actions for traceability."""
        self.audit_log.append({
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "action": action,
            "details": details
        })

    def _heal_data(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Self-heals dirty data and provides fallbacks."""
        healed = dict(record)

        # Fallback for rate
        if 'hourly_rate' not in healed or healed['hourly_rate'] is None:
            healed['hourly_rate'] = 0.0
            self._log("heal_data", f"Record {healed.get('id', 'unknown')} missing hourly_rate, defaulted to 0.0")
        try:
            healed['hourly_rate'] = float(healed['hourly_rate'])
        except (ValueError, TypeError):
            healed['hourly_rate'] = 0.0
            self._log("heal_data", f"Record {healed.get('id', 'unknown')} invalid hourly_rate, defaulted to 0.0")

        # Fallback for ID
        if 'id' not in healed:
            healed['id'] = 'unknown'

        # Handle project/job type
        if 'project' not in healed:
            healed['project'] = 'default'
        if 'job_type' not in healed:
            healed['job_type'] = 'default'

        # Policy dates
        if 'policy_start' not in healed or not healed['policy_start']:
            healed['policy_start'] = '1970-01-01'
        if 'policy_end' not in healed or not healed['policy_end']:
            healed['policy_end'] = '2099-12-31'

        return healed

    def _is_policy_active(self, policy_start: str, policy_end: str, current_date: datetime.date) -> bool:
        """Checks if the policy is currently active."""
        try:
            start_date = datetime.date.fromisoformat(policy_start)
            end_date = datetime.date.fromisoformat(policy_end)
            return start_date <= current_date <= end_date
        except ValueError:
            return True

    def scan_anomalies(self, records: List[Dict[str, Any]], current_date: datetime.date = None) -> List[Dict[str, Any]]:
        """
        Scans a list of settlement records for anomalies.
        Returns the clean, final net results to the frontend, marking them with Red/Yellow/Green.
        """
        if not records:
            return []

        if current_date is None:
            current_date = datetime.date.today()

        self._log("scan_started", f"Started scanning {len(records)} records")

        healed_records = [self._heal_data(r) for r in records]

        # Group by project and job type for statistical analysis
        grouped_rates: Dict[str, List[float]] = {}
        for r in healed_records:
            key = f"{r['project']}_{r['job_type']}"
            if key not in grouped_rates:
                grouped_rates[key] = []
            grouped_rates[key].append(r['hourly_rate'])

        # Calculate statistics per group
        stats: Dict[str, Dict[str, float]] = {}
        for key, rates in grouped_rates.items():
            if not rates:
                continue
            rates.sort()
            n = len(rates)

            if n < 4:
                # Not enough data for IQR, use simple mean
                mean = sum(rates) / n if n > 0 else 0
                stats[key] = {'mean': mean, 'std': 0, 'q1': mean, 'q3': mean, 'iqr': 0}
            else:
                q1 = rates[n // 4]
                q3 = rates[(n * 3) // 4]
                iqr = q3 - q1
                mean = sum(rates) / n
                variance = sum((x - mean) ** 2 for x in rates) / n
                std = math.sqrt(variance)
                stats[key] = {'mean': mean, 'std': std, 'q1': q1, 'q3': q3, 'iqr': iqr}

        results = []
        anomalies = []

        for r in healed_records:
            key = f"{r['project']}_{r['job_type']}"
            stat = stats.get(key, {'mean': 0, 'std': 0, 'q1': 0, 'q3': 0, 'iqr': 0})

            rate = r['hourly_rate']

            # Policy check
            is_active = self._is_policy_active(r['policy_start'], r['policy_end'], current_date)

            # Statistical anomaly check (Z-score and IQR)
            is_outlier = False
            anomaly_score = 0.0
            reasons = []

            if not is_active:
                is_outlier = True
                anomaly_score += 100.0  # High score for policy violation
                reasons.append("政策有效期越界")

            if stat['iqr'] > 0:
                # IQR method
                lower_bound = stat['q1'] - 1.5 * stat['iqr']
                upper_bound = stat['q3'] + 1.5 * stat['iqr']
                if rate < lower_bound or rate > upper_bound:
                    is_outlier = True
                    score = abs(rate - stat['mean']) / stat['iqr']
                    anomaly_score += score
                    reasons.append(f"单价偏离同工种正常范围(正常: {lower_bound:.1f}-{upper_bound:.1f})")

            if stat['iqr'] == 0 and stat['std'] > 0:
                z_score = abs(rate - stat['mean']) / stat['std']
                if z_score > 3:
                    is_outlier = True
                    anomaly_score += z_score
                    reasons.append("单价异常波动")

            # Simple % jump check fallback
            if stat['mean'] > 0 and abs(rate - stat['mean']) / stat['mean'] > 1.0: # Exceeds 100% of mean
                is_outlier = True
                anomaly_score += abs(rate - stat['mean']) / stat['mean'] * 50
                if "单价跳变过大" not in reasons:
                    reasons.append("单价跳变过大")

            if is_outlier:
                marker = 'Red' if anomaly_score > 5 else 'Yellow'
                reason_str = "，".join(reasons)
            else:
                marker = 'Green'
                reason_str = ""

            result_entry = {
                'id': r['id'],
                'hourly_rate': rate,
                'marker': marker,
                'reason': reason_str,
                'is_top_anomaly': False,
                'anomaly_score': anomaly_score
            }
            results.append(result_entry)

            if is_outlier:
                anomalies.append(result_entry)

        # Highlight top 3% anomalies (at least 1 if there are any anomalies)
        if anomalies:
            anomalies.sort(key=lambda x: x['anomaly_score'], reverse=True)
            top_k = max(1, math.ceil(len(records) * 0.03))

            for i, anomaly in enumerate(anomalies):
                if i < top_k:
                    # Find in results and mark
                    for res in results:
                        if res['id'] == anomaly['id']:
                            res['is_top_anomaly'] = True
                            if not res['reason']:
                                res['reason'] = "需关注异常项"
                            res['marker'] = 'Red'
                            self._log("anomaly_flagged", f"Flagged {res['id']} as top anomaly. Reason: {res['reason']}")
                            break

        self._log("scan_completed", f"Finished scanning. Found {len(anomalies)} anomalies, flagged {min(len(anomalies), math.ceil(len(records) * 0.03))} as top.")

        # Strip internal score before returning to frontend
        for res in results:
            del res['anomaly_score']

        return results

    def get_audit_log(self) -> List[Dict[str, Any]]:
        """Returns the internal audit log."""
        return self.audit_log
