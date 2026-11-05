import decimal
import math

# Use 0.00 Decimal string formatting
ZERO = decimal.Decimal('0.00')

def safe_decimal(val):
    try:
        if val is None:
            return ZERO
        if isinstance(val, (int, float, str)):
            return decimal.Decimal(str(val)).quantize(ZERO)
        if isinstance(val, decimal.Decimal):
            return val.quantize(ZERO)
        return ZERO
    except Exception:
        return ZERO

def audit_vendor_commissions(records=None, **kwargs):
    if records is None:
        records = []

    if not isinstance(records, list):
        return []

    processed_records = []

    # 10 Iron Rules calculation base
    for idx, record in enumerate(records):
        if not isinstance(record, dict):
            continue

        salary = safe_decimal(record.get('salary', 0))
        attendance = safe_decimal(record.get('attendance', 0))
        policy_compliance = safe_decimal(record.get('policy_compliance', 0))
        last_month_commission = safe_decimal(record.get('last_month_commission', 0))

        # Calculate base score based on absolute values (financial impact)
        # To find anomalies we look at total value magnitude and weird patterns

        total_magnitude = float(abs(salary) + abs(attendance) + abs(policy_compliance) + abs(last_month_commission))

        # Add basic score
        score = total_magnitude

        # Red flags for negative values where they shouldn't be or extreme attendance
        reasons = []
        if salary < 0:
            score += 1000000
            reasons.append("异常负数工资")

        if attendance < 0 or attendance > 31:
            score += 1000000
            reasons.append("异常考勤天数")

        if last_month_commission < 0:
            score += 1000000
            reasons.append("异常上月提成扣减")

        processed_records.append({
            'original_id': record.get('id', f'unknown_{idx}'),
            'original_index': idx,
            'salary': salary,
            'attendance': attendance,
            'policy_compliance': policy_compliance,
            'last_month_commission': last_month_commission,
            'anomaly_score': score,
            'reasons': reasons
        })

    if not processed_records:
        return []

    n = len(processed_records)

    # Calculate Z-Score for the total_magnitude to find IQR / Z-Score based anomalies
    if n > 1:
        mean_score = sum(r['anomaly_score'] for r in processed_records) / n
        variance = sum((r['anomaly_score'] - mean_score) ** 2 for r in processed_records) / n
        std_dev = math.sqrt(variance) if variance > 0 else 1

        for r in processed_records:
            z_score = (r['anomaly_score'] - mean_score) / std_dev
            r['z_score'] = z_score
            r['final_score'] = r['anomaly_score'] + (abs(z_score) * 1000)
    else:
        for r in processed_records:
            r['z_score'] = 0
            r['final_score'] = r['anomaly_score']

    # Sort descending by final score
    processed_records.sort(key=lambda x: x['final_score'], reverse=True)

    # Strictly Top 3% logic
    top_3_count = max(1, math.ceil(n * 0.03)) if n >= 34 else (1 if n > 0 else 0)

    results = []
    for i, r in enumerate(processed_records):
        is_anomaly = i < top_3_count

        status = 'Green'
        display_reason = "正常放行"

        if is_anomaly:
            status = 'Red' if r['reasons'] else 'Yellow'
            display_reason = ", ".join(r['reasons']) if r['reasons'] else f"数值偏离度过高 (Z-Score: {r['z_score']:.2f})"

        results.append({
            'id': r['original_id'],
            'original_index': r['original_index'],
            'salary': r['salary'],
            'attendance': r['attendance'],
            'policy_compliance': r['policy_compliance'],
            'last_month_commission': r['last_month_commission'],
            'status': status,
            'reason': display_reason
        })

    # restore original order
    results.sort(key=lambda x: x['original_index'])

    # Clean up output
    for r in results:
        del r['original_index']

    return results
