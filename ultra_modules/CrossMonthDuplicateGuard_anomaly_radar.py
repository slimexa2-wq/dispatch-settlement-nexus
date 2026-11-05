import math
import statistics
import datetime

def scan_anomalies(records=None):
    """
    Zero-configuration fault-tolerant anomaly scanner for cross-month duplicate claims.
    Automatically handles missing parameters, dirty data, and gracefully defaults.
    """
    if records is None:
        return []

    if not isinstance(records, list):
        records = [records]

    if not records:
        return []

    cleaned_records = []
    for i, r in enumerate(records):
        if not isinstance(r, dict):
            r = {'_raw_data': r}

        w_id = str(r.get('worker_id', f'auto_worker_{i}'))
        p_id = str(r.get('project_id', f'auto_project_{i}'))

        raw_amount = r.get('amount', 0.0)
        try:
            amt = float(raw_amount)
        except (ValueError, TypeError):
            amt = 0.0

        new_r = dict(r)
        new_r['worker_id'] = w_id
        new_r['project_id'] = p_id
        new_r['amount'] = amt
        new_r['_original_index'] = i
        cleaned_records.append(new_r)

    group_counts = {}
    for r in cleaned_records:
        key = (r['worker_id'], r['project_id'])
        group_counts[key] = group_counts.get(key, 0) + 1

    amounts = [r['amount'] for r in cleaned_records]
    n = len(amounts)

    mean_amt = statistics.mean(amounts)
    stdev_amt = statistics.stdev(amounts) if n > 1 else 0.0

    sorted_amounts = sorted(amounts)
    q1 = sorted_amounts[n // 4]
    q3 = sorted_amounts[(3 * n) // 4]
    iqr = q3 - q1
    upper_bound = q3 + 1.5 * iqr

    for r in cleaned_records:
        amt = r['amount']
        z = (amt - mean_amt) / stdev_amt if stdev_amt > 0 else 0.0
        r['_z_score'] = z
        r['_is_iqr_outlier'] = amt > upper_bound

        freq = group_counts[(r['worker_id'], r['project_id'])]
        r['_freq'] = freq

        # Anomaly score prioritizes high frequency first, then Z-Score
        r['_anomaly_score'] = (freq * 1000.0) + z

    # Sort descending by anomaly score to find top outliers
    cleaned_records.sort(key=lambda x: x['_anomaly_score'], reverse=True)

    # Identify Top 3%
    top_3_count = int(math.ceil(n * 0.03))

    for i, r in enumerate(cleaned_records):
        if i < top_3_count:
            if r['_freq'] > 1 or r['_is_iqr_outlier'] or r['_z_score'] > 2:
                r['status_color'] = 'RED'
                r['anomaly_reason'] = f"发现异常：同一项目重复申领{r['_freq']}次" if r['_freq'] > 1 else f"发现异常：金额达{r['amount']}偏离分布"
            else:
                r['status_color'] = 'YELLOW'
                r['anomaly_reason'] = "风险提示：金额处于整体Top 3%高位"
        else:
            r['status_color'] = 'GREEN'
            r['anomaly_reason'] = "数据正常，静默放行"

        r['audit_log'] = f"[AUDIT] trace_id={r.get('id', r['_original_index'])}, freq={r['_freq']}, z={r['_z_score']:.2f}"

        del r['_z_score']
        del r['_is_iqr_outlier']
        del r['_freq']
        del r['_anomaly_score']

    # Restore original order to be non-destructive
    cleaned_records.sort(key=lambda x: x['_original_index'])
    for r in cleaned_records:
        del r['_original_index']

    return cleaned_records
