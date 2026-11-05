from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any

def split_utility_fee(total_fee: Any = 0, residents: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Splits utility fees among residents based on days stayed, maintaining an audit trace.
    Returns:
        {"net_results": [{"id": ..., "fee": ...}], "audit_trace": [...]}
    """
    audit_trace = []

    # 1. Fault tolerance for missing/dirty parameters
    audit_trace.append({"step": "Init", "details": f"Raw total_fee={total_fee}, residents count={len(residents) if residents else 0}"})

    try:
        total_fee_dec = Decimal(str(total_fee))
    except (ValueError, TypeError, Exception):
        total_fee_dec = Decimal('0')
        audit_trace.append({"step": "Fix Total Fee", "details": f"Invalid total_fee '{total_fee}' defaulted to 0"})

    if total_fee_dec < 0:
        audit_trace.append({"step": "Fix Total Fee", "details": f"Negative total_fee '{total_fee_dec}' defaulted to 0"})
        total_fee_dec = Decimal('0')

    if not residents:
        audit_trace.append({"step": "Fix Residents", "details": "Residents list is empty or None, defaulting to []"})
        residents_list = []
    else:
        residents_list = residents

    # 2. Process residents and normalize days
    valid_residents = []
    total_days = Decimal('0')

    for i, res in enumerate(residents_list):
        if not isinstance(res, dict):
            audit_trace.append({"step": f"Fix Resident {i}", "details": "Invalid resident format, skipped"})
            continue

        res_id = res.get('id', f"unknown_{i}")
        days = res.get('days_stayed', 0)

        try:
            days_dec = Decimal(str(days))
        except (ValueError, TypeError, Exception):
            audit_trace.append({"step": f"Fix Resident {res_id}", "details": f"Invalid days '{days}' defaulted to 0"})
            days_dec = Decimal('0')

        if days_dec < 0:
            audit_trace.append({"step": f"Fix Resident {res_id}", "details": f"Negative days '{days_dec}' defaulted to 0"})
            days_dec = Decimal('0')

        valid_residents.append({"id": res_id, "days": days_dec})
        total_days += days_dec

    audit_trace.append({"step": "Calculate Total Days", "details": f"Total valid days={total_days}"})

    # 3. Calculate fees
    net_results = []

    if total_fee_dec == 0:
        audit_trace.append({"step": "Calculate Fees", "details": "Total fee is 0, all residents pay 0"})
        for res in valid_residents:
            net_results.append({"id": res["id"], "fee": "0.00"})
    elif total_days == 0:
        # Fee > 0, but no one stayed. No one should pay anything? Or split evenly?
        # Usually if no one stayed, we can't split proportionally. Default to 0 for all, or split equally.
        # Let's say we split equally if there are valid residents, else 0.
        if valid_residents:
            audit_trace.append({"step": "Calculate Fees", "details": "Total fee > 0 but total days = 0. Splitting equally."})
            split_amount = (total_fee_dec / Decimal(len(valid_residents))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

            # Adjust rounding differences
            allocated_fee = Decimal('0')
            for i, res in enumerate(valid_residents):
                if i == len(valid_residents) - 1:
                    # Last person gets the remainder
                    final_fee = total_fee_dec - allocated_fee
                else:
                    final_fee = split_amount
                net_results.append({"id": res["id"], "fee": str(final_fee)})
                allocated_fee += final_fee
        else:
            audit_trace.append({"step": "Calculate Fees", "details": "Total fee > 0 but no valid residents to split."})
    else:
        audit_trace.append({"step": "Calculate Fees", "details": "Splitting proportionally by days."})
        allocated_fee = Decimal('0')
        for i, res in enumerate(valid_residents):
            if i == len(valid_residents) - 1:
                # Last person gets the remainder to ensure sum(fees) == total_fee_dec
                final_fee = total_fee_dec - allocated_fee
                audit_trace.append({"step": f"Calculate Fee for {res['id']}", "details": f"Last resident gets remainder: {final_fee}"})
            else:
                proportion = res["days"] / total_days
                raw_fee = total_fee_dec * proportion
                final_fee = raw_fee.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                audit_trace.append({"step": f"Calculate Fee for {res['id']}", "details": f"Proportion {res['days']}/{total_days}, Raw={raw_fee}, Final={final_fee}"})

            net_results.append({"id": res["id"], "fee": str(final_fee)})
            allocated_fee += final_fee

    audit_trace.append({"step": "Finalize", "details": "Calculation complete"})

    return {
        "net_results": net_results,
        "audit_trace": audit_trace
    }
