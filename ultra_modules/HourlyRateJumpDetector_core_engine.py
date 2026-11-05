import logging
from datetime import datetime
from collections import defaultdict

logger = logging.getLogger(__name__)

def parse_date(date_val):
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val
    if isinstance(date_val, str):
        try:
            return datetime.fromisoformat(date_val.replace('Z', '+00:00'))
        except ValueError:
            pass
        try:
            return datetime.strptime(date_val, "%Y-%m-%d")
        except ValueError:
            pass
    return None

def safe_float(val, default=0.0):
    try:
        f_val = float(val)
        return max(0.0, f_val) # No negative rates
    except (ValueError, TypeError):
        return default

def check_hourly_rate_anomalies(records, jump_threshold_ratio=0.5):
    """
    Core function to detect hourly rate jumps and policy validity out of bounds.
    - Zero config
    - Tolerates dirty data (missing keys, bad formats)
    - Returns a list of anomalies dicts.
    """
    if not isinstance(records, list):
        return []

    anomalies = []

    # Group records by (project_id, job_type) for rate jump detection
    # Sort them by date to detect chronological jumps
    grouped_records = defaultdict(list)

    for i, record in enumerate(records):
        if not isinstance(record, dict):
            continue

        record_id = record.get('id', f'idx_{i}')
        project_id = str(record.get('project_id', 'UNKNOWN_PROJECT'))
        job_type = str(record.get('job_type', 'UNKNOWN_JOB'))

        # Parse numbers
        hourly_rate = safe_float(record.get('hourly_rate', 0.0))

        # Parse dates
        settlement_date = parse_date(record.get('settlement_date'))
        policy_start = parse_date(record.get('policy_start_date'))
        policy_end = parse_date(record.get('policy_end_date'))

        # 1. Check Policy Out of Bounds
        if settlement_date:
            out_of_bounds = False
            if policy_start and settlement_date < policy_start:
                out_of_bounds = True
            if policy_end and settlement_date > policy_end:
                out_of_bounds = True

            if out_of_bounds:
                anomalies.append({
                    "record_id": record_id,
                    "type": "POLICY_OUT_OF_BOUNDS",
                    "details": f"Settlement date {settlement_date} out of bounds ({policy_start} - {policy_end})"
                })

        # Add to group for jump detection
        if settlement_date and hourly_rate > 0:
            grouped_records[(project_id, job_type)].append({
                "record_id": record_id,
                "date": settlement_date,
                "rate": hourly_rate
            })

    # 2. Check Hourly Rate Jumps
    for (proj, job), items in grouped_records.items():
        if len(items) < 2:
            continue

        # Sort by date
        items.sort(key=lambda x: x['date'])

        for idx in range(1, len(items)):
            prev_rate = items[idx-1]['rate']
            curr_rate = items[idx]['rate']

            if prev_rate > 0:
                jump_ratio = abs(curr_rate - prev_rate) / prev_rate
                if jump_ratio > jump_threshold_ratio:
                    anomalies.append({
                        "record_id": items[idx]['record_id'],
                        "type": "RATE_JUMP_ABNORMAL",
                        "details": f"Rate jumped from {prev_rate} to {curr_rate} (ratio: {jump_ratio:.2f}) for proj {proj} job {job}"
                    })

    return anomalies
