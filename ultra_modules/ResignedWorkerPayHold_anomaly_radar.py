import math

def _clean_numeric(val, default=0.0):
    """
    Silently cleans dirty numeric data, repairing missing parameters, string numbers,
    and negative values to ensure zero-configuration fault tolerance.
    """
    if val is None:
        return default
    try:
        if isinstance(val, (int, float)):
            val = float(val)
        elif isinstance(val, str):
            val = val.replace(',', '').strip()
            if not val:
                return default
            val = float(val)
        else:
            val = default

        if math.isnan(val) or math.isinf(val):
            val = default

        # Treat negative values as positive in this context, or clamp to 0.
        # Using abs() self-heals accidental negative signs from users.
        return max(0.0, abs(val))
    except Exception:
        return default

def _get_percentile(sorted_data, percentile):
    """
    Calculates the given percentile of a sorted list of numbers.
    """
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (percentile / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_data[int(k)]
    d0 = sorted_data[int(f)] * (c - k)
    d1 = sorted_data[int(c)] * (k - f)
    return d0 + d1

def scan_resigned_worker_deductions(records):
    """
    Scans deduction data for resigned workers and classifies anomalies into RED, YELLOW, GREEN.
    Automatically highlights the Top 3% extreme anomalous items based on distribution (Z-score/IQR).
    Remaining 97% normal items silently pass.
    """
    if not records:
        return []

    cleaned_records = []
    metrics = []

    for idx, record in enumerate(records):
        if not isinstance(record, dict):
            # Fault tolerance: repair completely invalid objects into empty dicts
            record = {}

        # Missing parameter default fallbacks
        worker_id = record.get('worker_id', f'auto_id_{idx}')
        pending_salary = _clean_numeric(record.get('pending_salary'), default=0.0)
        deduction_amount = _clean_numeric(record.get('deduction_amount'), default=0.0)

        # Calculate anomaly metric (deduction severity ratio)
        if pending_salary > 0:
            metric = deduction_amount / pending_salary
        else:
            # If there's no pending salary, absolute deduction becomes the metric severity
            metric = deduction_amount if deduction_amount > 0 else 0.0

        cleaned_records.append({
            'worker_id': worker_id,
            'pending_salary': pending_salary,
            'deduction_amount': deduction_amount,
            'metric': metric,
            'original': record
        })
        metrics.append(metric)

    if not metrics:
        return []

    # Sort for percentile and IQR calculations
    metrics_sorted = sorted(metrics)

    q1 = _get_percentile(metrics_sorted, 25)
    q3 = _get_percentile(metrics_sorted, 75)
    iqr = q3 - q1
    iqr_upper_bound = q3 + 1.5 * iqr

    # We want to identify the Top 3%
    p97_threshold = _get_percentile(metrics_sorted, 97)

    # Calculate for Z-score
    mean = sum(metrics_sorted) / len(metrics_sorted)
    variance = sum((x - mean)**2 for x in metrics_sorted) / len(metrics_sorted)
    std_dev = math.sqrt(variance) if variance > 0 else 0.0

    results = []

    for item in cleaned_records:
        metric = item['metric']
        salary = item['pending_salary']
        deduction = item['deduction_amount']

        z_score = (metric - mean) / std_dev if std_dev > 0 else 0.0

        # For small arrays (e.g. length < 34), math percentile 97 might just select the max or be equal to almost all non-zero values if many values are 0.
        # So we should be careful. Actually, top 3% means strict percentile threshold.
        # But if the threshold is 0.0 because of so many 0s, we don't want to flag 0 as anomaly.

        # In a list of N elements, top 3% means index >= N * 0.97
        # To avoid problems with small arrays where p97 == max, we use percentile function.
        # However, if there are multiple elements with the same max value, we might flag all of them.
        is_top_3 = False
        if metric > 0 and len(metrics_sorted) >= 10:
            if metric >= p97_threshold and metric > _get_percentile(metrics_sorted, 96):
                is_top_3 = True
            elif metric >= p97_threshold and p97_threshold > mean + std_dev:
                is_top_3 = True
        elif metric > 0 and len(metrics_sorted) < 10:
            # For very small arrays, only strictly flag if it's exceptionally high compared to mean
            if metric > mean + 2 * std_dev:
                is_top_3 = True

        status = 'GREEN'
        reason = '静默放行：数据处于正常分布范围内，自动合规校验通过。'

        if is_top_3:
            # For the top 3%, we use Z-Score and IQR to classify as RED or YELLOW
            # Extremely anomalous: Z-score > 3 or exceeds IQR upper bound significantly, or severe logic flaw (deduction without salary)
            # To handle extremely concentrated distributions where IQR=0,
            # we need a sensible lower bound for extreme anomalies so we don't flag
            # everything above 10% as a RED anomaly just because IQR was 0.
            # E.g. we can set a fallback like metric > max(0.5, iqr_upper_bound * 2.5) for RED
            # or rely more heavily on absolute bounds for RED.
            if metric > max(0.5, iqr_upper_bound + 0.3) or (salary == 0 and deduction > 0) or metric > 1.0 or z_score > 4.0:
                status = 'RED'
                if salary == 0:
                    reason = f'高危异常：待发薪资为0但急辞扣款达到{deduction}，属于严重倒挂！'
                elif metric > 1.0:
                    reason = f'高危异常：扣款金额({deduction})大于待发薪资({salary})，扣除比例达{metric*100:.1f}%，需立即人工核查！'
                else:
                    reason = f'高危异常：扣款比例高达{metric*100:.1f}%，严重偏离整体分布(触发分布上限警报)！'
            else:
                status = 'YELLOW'
                reason = f'中度异常：扣款比例处于全员前3%最高扣款区间({metric*100:.1f}%)，建议复核。'
        else:
            # Fallback for 97% normal group:
            # If it's not in top 3% mathematically, but it has zero salary with positive deduction (extreme edge case in tiny datasets)
            if salary == 0 and deduction > 0:
                status = 'YELLOW'
                reason = f'异常注意：待发薪资为0但存在扣款{deduction}，建议关注。'

        results.append({
            'worker_id': item['worker_id'],
            'status': status,
            'reason': reason,
            'processed_pending_salary': salary,
            'processed_deduction_amount': deduction
        })

    return results
