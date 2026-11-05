import math
import statistics

def _clean_days(val) -> int:
    """Safely cast a dirty value to integer days, fallback to 0 if invalid."""
    if val is None:
        return 0
    if isinstance(val, (int, float)) and not math.isnan(val):
        return max(0, int(val))
    if isinstance(val, str):
        try:
            return max(0, int(float(val)))
        except ValueError:
            return 0
    return 0

def _clean_fee(val) -> float:
    """Safely cast fee to float."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return 0.0 if math.isnan(val) else max(0.0, float(val))
    if isinstance(val, str):
        try:
            return max(0.0, float(val))
        except ValueError:
            return 0.0
    return 0.0

def calculate_fee_splits_and_scan(room_data: list, total_fee: float) -> list:
    """
    Calculate fee split based on actual days lived and apply anomaly radar.
    room_data: list of dicts [{'name': 'A', 'days': 30}, ...]
    total_fee: float total fee to split
    """
    total_fee = _clean_fee(total_fee)
    if not isinstance(room_data, list):
        return []

    cleaned_data = []
    for item in room_data:
        if not isinstance(item, dict):
            continue
        name = str(item.get('name', 'Unknown'))
        days = _clean_days(item.get('days', 0))
        cleaned_data.append({'name': name, 'days': days})

    total_days = sum(item['days'] for item in cleaned_data)

    results = []
    if total_days <= 0:
        # If total days is 0, we can't split proportionally. Everyone gets 0, or split equally?
        # A fair split is 0, since no one lived there.
        # But if there's a total_fee > 0 and 0 days, it's an anomaly. Let's split equally to avoid dropping fees if total_days=0 but people exist.
        if cleaned_data:
            split = total_fee / len(cleaned_data)
            for item in cleaned_data:
                results.append({
                    'name': item['name'],
                    'days': item['days'],
                    'fee': round(split, 2),
                    'tag': 'GREEN',
                    'reason': 'No days recorded, equal split'
                })
        return results

    # Normal proportional split
    fees = []
    for item in cleaned_data:
        fee = (item['days'] / total_days) * total_fee
        fees.append(fee)
        results.append({
            'name': item['name'],
            'days': item['days'],
            'fee': round(fee, 2)
        })

    # Anomaly scanning
    n = len(fees)
    if n < 3:
        # Not enough data for statistical anomaly
        for r in results:
            r['tag'] = 'GREEN'
            r['reason'] = 'Normal'
        return results

    # We use Z-score / IQR to find top 3% anomalies or outliers
    # We want to identify top 3% or outliers.
    sorted_fees = sorted(fees)
    q1 = sorted_fees[n // 4]
    q3 = sorted_fees[(n * 3) // 4]
    iqr = q3 - q1
    upper_bound_iqr = q3 + 1.5 * iqr

    try:
        mean = statistics.mean(fees)
        stdev = statistics.stdev(fees)
    except statistics.StatisticsError:
        mean = sum(fees)/len(fees)
        stdev = 0

    # We want to mark top 3% as RED
    threshold_3_percent = 0
    top_k_indices = set()
    if n >= 34: # 1/33 ~ 3%, only makes sense for larger lists to strictly take 3%
        k = max(1, math.ceil(n * 0.03))
        # Find the threshold value
        threshold_3_percent = sorted_fees[-k]

        # To handle duplicates correctly and exactly mark k items, we can track exactly k top items by index if needed.
        # But a simple threshold is usually fine if there are no exact duplicates at the boundary.
        # Let's just use the threshold. However, if all values are 100, threshold is 100 and all become red!
        # To fix this, we should only mark as red if it's strictly an anomaly AND in top 3%.
        # A better approach: We only want to flag anomalies.

    for r in results:
        f = r['fee']
        is_red = False
        reason = 'Normal'

        # Determine RED
        # A value must actually be an outlier/high to be flagged.
        is_statistically_high = False
        if stdev > 0 and (f - mean) / stdev > 2.5: # Z-score > 2.5
            is_statistically_high = True
            reason = '统计分布极高异常(Z-Score > 2.5)'
        elif iqr > 0 and f > upper_bound_iqr:
            is_statistically_high = True
            reason = '统计分布偏高异常(IQR Outlier)'

        is_yellow = False

        if n >= 34:
            if f >= threshold_3_percent and is_statistically_high:
                is_red = True
                reason = '极高异常值(Top 3%)'
            elif is_statistically_high:
                # Is outlier but not top 3%
                is_yellow = True
                reason = '轻微统计偏差，待观察'
        else:
            if is_statistically_high:
                is_red = True
                reason = '小样本量异常偏差'

        if is_red:
            r['tag'] = 'RED'
            r['reason'] = reason
        elif is_yellow:
            r['tag'] = 'YELLOW'
            r['reason'] = reason
        else:
            r['tag'] = 'GREEN'
            r['reason'] = 'Normal'

    return results
