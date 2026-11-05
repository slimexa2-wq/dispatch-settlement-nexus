import decimal
import uuid
from typing import List, Dict, Any, Optional

# Set global decimal precision context just to be safe, though default is usually fine
decimal.getcontext().prec = 28

def process_advance_deduction(
    base_salary: Any,
    advances: Optional[List[Dict[str, Any]]] = None,
    min_take_home_ratio: Any = "0.2"
) -> Dict[str, Any]:
    """
    Process advance loan deductions from a worker's salary with an over-deduction guard.

    Args:
        base_salary: The total gross salary before deductions.
        advances: List of advance records, e.g., [{"id": "a1", "amount": 100}, ...]
        min_take_home_ratio: Minimum ratio of the base salary that must be paid out. Default is 0.2 (20%).

    Returns:
        Dict containing:
            - net_salary: Decimal of final pay after deductions.
            - total_deducted: Decimal of total amount deducted.
            - audit_log: List of string logs detailing every step (dirty data fixes, deduplication, max guards).
    """
    audit_log = []

    # 1. Initialize and clean base salary
    audit_log.append("INITIALIZE: Starting advance deduction process.")
    try:
        base_salary_dec = decimal.Decimal(str(base_salary))
        if base_salary_dec < 0:
            base_salary_dec = decimal.Decimal("0.00")
            audit_log.append("CLEANING: base_salary < 0, adjusted to 0.00")
    except (decimal.InvalidOperation, TypeError, ValueError):
        base_salary_dec = decimal.Decimal("0.00")
        audit_log.append(f"CLEANING: Invalid base_salary '{base_salary}', defaulted to 0.00")

    audit_log.append(f"STATE: base_salary = {base_salary_dec}")

    # 2. Initialize and clean minimum ratio
    try:
        min_ratio_dec = decimal.Decimal(str(min_take_home_ratio))
        if min_ratio_dec < 0:
            min_ratio_dec = decimal.Decimal("0.00")
        elif min_ratio_dec > 1:
            min_ratio_dec = decimal.Decimal("1.00")
    except (decimal.InvalidOperation, TypeError, ValueError):
        min_ratio_dec = decimal.Decimal("0.20")
        audit_log.append(f"CLEANING: Invalid min_take_home_ratio '{min_take_home_ratio}', defaulted to 0.20")

    audit_log.append(f"STATE: min_take_home_ratio = {min_ratio_dec}")

    # 3. Calculate max allowable deduction
    max_deduction = base_salary_dec * (decimal.Decimal("1.00") - min_ratio_dec)
    audit_log.append(f"STATE: Max allowable deduction = {max_deduction}")

    # 4. Process advances (deduplication & cleaning)
    if advances is None:
        advances = []
        audit_log.append("FALLBACK: advances parameter missing or None, defaulted to []")
    elif not isinstance(advances, list):
        advances = []
        audit_log.append("CLEANING: advances parameter is not a list, defaulted to []")

    unique_advances = {}
    total_requested_deduction = decimal.Decimal("0.00")

    for idx, advance in enumerate(advances):
        if not isinstance(advance, dict):
            audit_log.append(f"CLEANING: Skipped advance at index {idx}, not a dict.")
            continue

        adv_id = advance.get("id")
        if not adv_id:
            # Generate a random ID if none provided, to allow it without deduplication collisions
            adv_id = f"auto_{uuid.uuid4().hex[:8]}"
            audit_log.append(f"CLEANING: Advance at index {idx} missing 'id', generated {adv_id}.")
        else:
            adv_id = str(adv_id)

        # Deduplication check
        if adv_id in unique_advances:
            audit_log.append(f"DEDUPLICATION: Skipped duplicate advance ID '{adv_id}'.")
            continue

        # Amount cleaning
        raw_amt = advance.get("amount", 0)
        try:
            amt_dec = decimal.Decimal(str(raw_amt))
            if amt_dec < 0:
                amt_dec = decimal.Decimal("0.00")
                audit_log.append(f"CLEANING: Negative amount in advance '{adv_id}', adjusted to 0.00.")
        except (decimal.InvalidOperation, TypeError, ValueError):
            amt_dec = decimal.Decimal("0.00")
            audit_log.append(f"CLEANING: Invalid amount '{raw_amt}' in advance '{adv_id}', adjusted to 0.00.")

        unique_advances[adv_id] = amt_dec
        total_requested_deduction += amt_dec
        audit_log.append(f"PROCESS: Accepted advance '{adv_id}' with amount {amt_dec}.")

    audit_log.append(f"STATE: Total requested deduction = {total_requested_deduction}")

    # 5. Apply Over-Deduction Guard
    if total_requested_deduction > max_deduction:
        actual_deduction = max_deduction
        audit_log.append(f"GUARD: Over-deduction prevented! Requested: {total_requested_deduction}, Allowed: {max_deduction}")
    else:
        actual_deduction = total_requested_deduction
        audit_log.append("GUARD: Requested deduction within allowable limit.")

    # 6. Final calculation
    net_salary = base_salary_dec - actual_deduction
    audit_log.append(f"RESULT: Final net salary = {net_salary}, Total deducted = {actual_deduction}")

    return {
        "net_salary": net_salary,
        "total_deducted": actual_deduction,
        "audit_log": audit_log
    }
