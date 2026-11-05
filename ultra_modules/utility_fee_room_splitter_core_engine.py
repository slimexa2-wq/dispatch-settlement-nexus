import math

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
        remainder = round(clean_total_fee - sum(r['fee'] for r in clean_residents), 2)
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
