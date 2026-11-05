import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from collections import defaultdict
import uuid

logger = logging.getLogger(__name__)

# Field mapping for different schemas (v1 vs v2 etc.)
FIELD_ALIASES = {
    'id': ['id', 'record_id', 'uuid', '_id', 'rowId'],
    'project_id': ['project_id', 'projId', 'projectId', 'project', 'pid'],
    'job_type': ['job_type', 'jobType', 'job', 'position', 'role'],
    'hourly_rate': ['hourly_rate', 'hourlyRate', 'rate', 'price', 'unit_price', 'amount'],
    'settlement_date': ['settlement_date', 'settlementDate', 'date', 'work_date', 'workDate'],
    'policy_start_date': ['policy_start_date', 'policyStartDate', 'valid_from', 'startDate', 'start_date'],
    'policy_end_date': ['policy_end_date', 'policyEndDate', 'valid_to', 'endDate', 'end_date']
}

def semantic_fingerprint_mapper(record):
    """
    Silently maps different field names from various schemas to standard schema.
    Zero-config schema forward/backward compatibility.
    """
    if not isinstance(record, dict):
        return {}

    normalized_record = {}
    for standard_field, aliases in FIELD_ALIASES.items():
        # Find the first matching alias in the record
        for alias in aliases:
            if alias in record:
                normalized_record[standard_field] = record[alias]
                break # Stop at the first found alias for this field

        # Default empty string/None for missing critical fields handled later

    return normalized_record

def parse_date(date_val):
    if not date_val:
        return None
    if isinstance(date_val, datetime):
        return date_val.replace(tzinfo=None)
    if isinstance(date_val, str):
        try:
            return datetime.fromisoformat(date_val.replace('Z', '+00:00')).replace(tzinfo=None)
        except ValueError:
            pass
        try:
            return datetime.strptime(date_val, "%Y-%m-%d")
        except ValueError:
            pass
        # Extended formats for compatibility
        try:
            return datetime.strptime(date_val, "%Y/%m/%d")
        except ValueError:
            pass
    return None

def safe_decimal(val, default=Decimal('0.0')):
    if val is None:
        return default
    if isinstance(val, Decimal):
        return val if val >= 0 else default
    try:
        d_val = Decimal(str(val))
        return d_val if d_val >= 0 else default
    except (InvalidOperation, TypeError, ValueError):
        return default

def bridge_and_normalize(records):
    """
    Normalizes a list of records using semantic fingerprinting.
    """
    if not isinstance(records, list):
        return []

    normalized_list = []
    for record in records:
        if not isinstance(record, dict):
            continue
        norm_rec = semantic_fingerprint_mapper(record)

        # Fallbacks for missing required params
        norm_rec['id'] = str(norm_rec.get('id', uuid.uuid4()))
        norm_rec['project_id'] = str(norm_rec.get('project_id', 'UNKNOWN_PROJECT'))
        norm_rec['job_type'] = str(norm_rec.get('job_type', 'UNKNOWN_JOB'))

        norm_rec['hourly_rate'] = safe_decimal(norm_rec.get('hourly_rate'))
        norm_rec['settlement_date'] = parse_date(norm_rec.get('settlement_date'))
        norm_rec['policy_start_date'] = parse_date(norm_rec.get('policy_start_date'))
        norm_rec['policy_end_date'] = parse_date(norm_rec.get('policy_end_date'))

        normalized_list.append(norm_rec)

    return normalized_list

def integrate_and_detect(raw_records, jump_threshold_ratio=Decimal('0.5')):
    """
    Integration bridge for hourly rate anomaly detection.
    Maps records, checks bounds and jumps, returns standard anomalies.
    """

    normalized_records = bridge_and_normalize(raw_records)
    anomalies = []

    # Use Decimal for threshold as well
    threshold = safe_decimal(jump_threshold_ratio, Decimal('0.5'))

    grouped_records = defaultdict(list)

    for record in normalized_records:
        record_id = record['id']
        project_id = record['project_id']
        job_type = record['job_type']

        hourly_rate = record['hourly_rate']
        settlement_date = record['settlement_date']
        policy_start = record['policy_start_date']
        policy_end = record['policy_end_date']

        # 1. Policy Bounds Check
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
                    "details": f"Settlement date {settlement_date.strftime('%Y-%m-%d')} out of bounds"
                })

        # Add to groups for chronological jump detection
        if settlement_date and hourly_rate > 0:
            grouped_records[(project_id, job_type)].append({
                "record_id": record_id,
                "date": settlement_date,
                "rate": hourly_rate
            })

    # 2. Rate Jump Check
    for (proj, job), items in grouped_records.items():
        if len(items) < 2:
            continue

        items.sort(key=lambda x: x['date'])

        for idx in range(1, len(items)):
            prev_rate = items[idx-1]['rate']
            curr_rate = items[idx]['rate']

            if prev_rate > 0:
                jump_ratio = abs(curr_rate - prev_rate) / prev_rate
                if jump_ratio > threshold:
                    anomalies.append({
                        "record_id": items[idx]['record_id'],
                        "type": "RATE_JUMP_ABNORMAL",
                        "details": f"Rate jumped from {prev_rate} to {curr_rate} (ratio: {jump_ratio:.2f})"
                    })

    return anomalies
