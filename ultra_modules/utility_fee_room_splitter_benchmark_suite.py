import time
import random
import string
import math
from datetime import datetime, timedelta

def split_utility_fee(total_fee, residents):
    """
    Split utility fee proportionally based on the 'days' field in each resident's data.
    Implements zero-configuration fault tolerance:
      - Clean total_fee (fallback to 0.0 on invalid/missing input)
      - Clean residents data (fallback to 1 day on invalid day count, 'unknown' on missing name)
      - Handle edge cases (0 total days, 0 residents)
      - Ensure rounding handles remainder appropriately so the split sum exactly equals the total.
    """
    # 1. Clean total_fee
    try:
        if total_fee is None:
            clean_total_fee = 0.0
        else:
            clean_total_fee = float(total_fee)
            if math.isnan(clean_total_fee) or clean_total_fee < 0:
                clean_total_fee = 0.0
    except (ValueError, TypeError):
        clean_total_fee = 0.0

    # 2. Clean residents data
    clean_residents = []
    if not isinstance(residents, list):
        residents = []

    for r in residents:
        if not isinstance(r, dict):
            continue

        name = r.get('name')
        if not name or not isinstance(name, str) or not str(name).strip():
            name = 'unknown'
        else:
            name = str(name).strip()

        days = r.get('days')
        try:
            if days is None:
                clean_days = 1
            else:
                clean_days = int(float(days))
                if clean_days < 0:
                    clean_days = 1
        except (ValueError, TypeError):
            clean_days = 1

        clean_residents.append({
            'name': name,
            'days': clean_days,
            **{k: v for k, v in r.items() if k not in ['name', 'days']}
        })

    # 3. Handle edge cases
    if not clean_residents:
        return []

    if clean_total_fee == 0.0:
        for r in clean_residents:
            r['fee'] = 0.0
        return clean_residents

    total_days = sum(r['days'] for r in clean_residents)

    if total_days == 0:
        split_fee = round(clean_total_fee / len(clean_residents), 2)
        for r in clean_residents:
            r['fee'] = split_fee

        # fix remainder
        remainder = clean_total_fee - sum(r['fee'] for r in clean_residents)
        if remainder != 0:
            clean_residents[0]['fee'] = round(clean_residents[0]['fee'] + remainder, 2)
        return clean_residents

    # 4. Calculate fees and handle remainder
    total_assigned = 0.0
    for r in clean_residents:
        fee = round((r['days'] / total_days) * clean_total_fee, 2)
        r['fee'] = fee
        total_assigned += fee

    remainder = round(clean_total_fee - total_assigned, 2)

    # Assign remainder to the person with the most days to minimize relative error
    if remainder != 0:
        max_r = max(clean_residents, key=lambda x: x['days'])
        max_r['fee'] = round(max_r['fee'] + remainder, 2)

    return clean_residents


def generate_synthetic_fixtures(num_records):
    """
    Generate synthetic fixtures for benchmark and testing.
    Includes normal records, dirty data (nulls, garbage strings),
    and extreme boundaries (cross-year, cross-month dates).
    """
    records = []
    for i in range(num_records):
        choice = random.random()
        if choice < 0.7:
            # Normal record
            days = random.randint(0, 31)
            records.append({
                'name': f'Resident_{i}',
                'days': days,
                'room': 'A101'
            })
        elif choice < 0.8:
            # Dirty data (nulls, garbage)
            records.append({
                'name': None if random.random() < 0.5 else ''.join(random.choices(string.ascii_letters, k=5)),
                'days': 'invalid' if random.random() < 0.5 else None,
                'room': float('nan')
            })
        elif choice < 0.9:
            # Missing keys
            records.append({})
        else:
            # Extreme boundary (cross-year/cross-month, large days)
            records.append({
                'name': f'Boundary_{i}',
                'days': random.randint(30, 365),
                'room': 'A102'
            })
    return records

def run_benchmark(total_fee, residents, iterations=1000):
    """
    Run benchmark on the split_utility_fee algorithm.
    Ensures zero crashes and measures execution time.
    """
    start_time = time.time()

    # Run the splitting algorithm for specified iterations to test concurrency/load
    for _ in range(iterations):
        result = split_utility_fee(total_fee, residents)

    end_time = time.time()
    total_time_ms = (end_time - start_time) * 1000
    avg_time_ms = total_time_ms / iterations

    # Do one final run to return the actual result
    final_result = split_utility_fee(total_fee, residents)

    return {
        'total_time_ms': total_time_ms,
        'avg_time_ms': avg_time_ms,
        'result': final_result
    }
