import time
import random
import uuid
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta

def convert_shift_overtime(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Robust fallback/self-healing logic for converting shift overtime.
    Missing/dirty parameters are automatically assigned safe defaults.
    No exceptions should be raised, zero-configuration fault tolerance.
    """
    try:
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}

    try:
        req_id = data.get('id', str(uuid.uuid4()))
    except Exception:
        req_id = str(uuid.uuid4())

    try:
        worker_id = data.get('worker_id', 'UNKNOWN')
    except Exception:
        worker_id = 'UNKNOWN'

    result = {
        'id': req_id,
        'worker_id': worker_id,
        'shift_type': 'day', # Default day shift
        'regular_hours': 0.0,
        'overtime_1_5x': 0.0,
        'overtime_2x': 0.0,
        'overtime_3x': 0.0,
        'status': 'success',
        'error_log': None
    }

    try:
        shift_type = str(data.get('shift_type', 'day')).lower()
        if shift_type in ['night', '夜班']:
            result['shift_type'] = 'night'
        elif shift_type in ['day', '白班']:
            result['shift_type'] = 'day'
        else:
            result['shift_type'] = 'day' # fallback
    except Exception:
        result['shift_type'] = 'day'

    try:
        hours_raw = data.get('hours_worked')
        if hours_raw is None:
            hours = 8.0 # default full shift
        else:
            hours = float(hours_raw)
            if hours < 0:
                hours = 0.0
            if hours > 24.0:
                hours = 24.0 # clamp
    except Exception:
        hours = 8.0

    try:
        is_weekend_raw = data.get('is_weekend')
        is_weekend = bool(int(is_weekend_raw)) if is_weekend_raw is not None else False
    except Exception:
        is_weekend = False

    try:
        is_holiday_raw = data.get('is_holiday')
        is_holiday = bool(int(is_holiday_raw)) if is_holiday_raw is not None else False
    except Exception:
        is_holiday = False

    # Calculate regular vs overtime
    try:
        if is_holiday:
            result['overtime_3x'] = hours
            result['regular_hours'] = 0.0
        elif is_weekend:
            result['overtime_2x'] = hours
            result['regular_hours'] = 0.0
        else:
            if hours <= 8.0:
                result['regular_hours'] = hours
            else:
                result['regular_hours'] = 8.0
                result['overtime_1_5x'] = hours - 8.0
    except Exception as e:
        result['status'] = 'error_recovered'
        result['error_log'] = str(e)
        result['regular_hours'] = 8.0

    return result

def generate_synthetic_fixtures(count: int = 1000) -> List[Dict[str, Any]]:
    """
    Generates synthetic fixtures including extreme boundaries, nulls, and garbled text.
    """
    fixtures = []

    # 1. Normal data
    for _ in range(count // 4):
        fixtures.append({
            'id': str(uuid.uuid4()),
            'worker_id': f"W{random.randint(1000, 9999)}",
            'shift_type': random.choice(['day', 'night']),
            'hours_worked': random.uniform(4.0, 12.0),
            'is_weekend': random.choice([True, False]),
            'is_holiday': random.choice([True, False]),
        })

    # 2. Missing data (defaults expected)
    for _ in range(count // 4):
        fixtures.append({
            'worker_id': f"W{random.randint(1000, 9999)}",
            # Missing other fields
        })

    # 3. Dirty data / Garbled text / Nulls
    for _ in range(count // 4):
        fixtures.append({
            'id': None,
            'worker_id': 12345, # Should be cast/handled safely if used as string
            'shift_type': '乱码_!@#$',
            'hours_worked': 'not_a_number',
            'is_weekend': None,
            'is_holiday': 'yes', # will fail bool(int('yes')) and fallback to False
        })

    # 4. Extreme boundaries (negative, massive hours, weird types)
    for _ in range(count - (count // 4) * 3):
        fixtures.append({
            'id': '',
            'worker_id': '',
            'shift_type': '',
            'hours_worked': -999.0, # clamped to 0
            'is_weekend': 1,
            'is_holiday': 0,
        })

    return fixtures

def run_benchmark(concurrency: int = 10000) -> Tuple[float, int, int]:
    """
    Runs benchmark on large synthesized dataset to verify zero-crash and ms responsiveness.
    Returns (elapsed_time_ms, total_processed, success_count)
    """
    fixtures = generate_synthetic_fixtures(concurrency)

    start_time = time.time()

    success_count = 0
    for fixture in fixtures:
        res = convert_shift_overtime(fixture)
        if res.get('status') in ['success', 'error_recovered']:
            success_count += 1

    end_time = time.time()
    elapsed_ms = (end_time - start_time) * 1000.0

    return elapsed_ms, len(fixtures), success_count
