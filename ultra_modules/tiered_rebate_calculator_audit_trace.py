import decimal
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, Tuple, List, Optional

# Ensure high precision for money operations
decimal.getcontext().prec = 28

def _to_decimal(value: Any, default: Decimal = Decimal('0')) -> Decimal:
    if value is None:
        return default
    try:
        if isinstance(value, str):
            value = value.strip().replace(',', '')
        return Decimal(value)
    except (InvalidOperation, TypeError, ValueError):
        return default

def _to_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        if isinstance(value, str):
            value = value.strip().replace(',', '')
        return int(float(value))
    except (TypeError, ValueError):
        return default

def calculate_rebate(
    days_worked: Any = 0,
    absent_days: Any = 0,
    tiers: Optional[Dict[Any, Any]] = None,
    absent_deduction_per_day: Any = '0'
) -> Tuple[Decimal, List[Dict[str, Any]]]:
    """
    Calculates tiered rebate with a full audit trace.
    Returns a tuple of (net_rebate, audit_trace).
    """
    audit_trace = []

    # Self-healing for basic inputs
    clean_days_worked = _to_int(days_worked, 0)
    clean_absent_days = _to_int(absent_days, 0)

    if clean_days_worked < 0:
        audit_trace.append({
            "step": "clean_days_worked",
            "action": "healed negative days_worked to 0",
            "old": clean_days_worked,
            "new": 0
        })
        clean_days_worked = 0

    if clean_absent_days < 0:
        audit_trace.append({
            "step": "clean_absent_days",
            "action": "healed negative absent_days to 0",
            "old": clean_absent_days,
            "new": 0
        })
        clean_absent_days = 0

    audit_trace.append({
        "step": "input_parsing",
        "parsed_days_worked": clean_days_worked,
        "parsed_absent_days": clean_absent_days
    })

    clean_deduction_per_day = _to_decimal(absent_deduction_per_day, Decimal('0'))
    if clean_deduction_per_day < 0:
        # Abs the deduction instead of treating as negative
        clean_deduction_per_day = abs(clean_deduction_per_day)
        audit_trace.append({
            "step": "clean_deduction",
            "action": "healed negative absent_deduction_per_day to positive",
            "old": str(-clean_deduction_per_day),
            "new": str(clean_deduction_per_day)
        })

    # Default tiers initialization with self-healing
    clean_tiers = {}
    default_tiers = {
        7: Decimal('100.00'),
        15: Decimal('250.00'),
        30: Decimal('600.00'),
        45: Decimal('1000.00')
    }

    if not isinstance(tiers, dict) or not tiers:
        audit_trace.append({
            "step": "tiers_init",
            "action": "used default tiers because input was missing or invalid"
        })
        clean_tiers = default_tiers.copy()
    else:
        for k, v in tiers.items():
            parsed_k = _to_int(k, -1)
            parsed_v = _to_decimal(v, Decimal('-1'))
            if parsed_k >= 0 and parsed_v >= Decimal('0'):
                clean_tiers[parsed_k] = parsed_v
            else:
                audit_trace.append({
                    "step": "tiers_clean",
                    "action": f"ignored invalid tier: {k} -> {v}"
                })

        if not clean_tiers:
            audit_trace.append({
                "step": "tiers_init",
                "action": "used default tiers because all input tiers were invalid"
            })
            clean_tiers = default_tiers.copy()

    # Calculate base rebate by finding the highest applicable tier
    applicable_tier = 0
    base_rebate = Decimal('0')

    for tier_days in sorted(clean_tiers.keys()):
        if clean_days_worked >= tier_days:
            applicable_tier = tier_days
            base_rebate = clean_tiers[tier_days]

    audit_trace.append({
        "step": "base_rebate_calculation",
        "applicable_tier_days": applicable_tier,
        "base_rebate": str(base_rebate)
    })

    # Calculate deductions
    total_deduction = Decimal(clean_absent_days) * clean_deduction_per_day
    audit_trace.append({
        "step": "deduction_calculation",
        "absent_days": clean_absent_days,
        "deduction_per_day": str(clean_deduction_per_day),
        "total_deduction": str(total_deduction)
    })

    # Calculate net rebate
    net_rebate = base_rebate - total_deduction

    if net_rebate < 0:
        audit_trace.append({
            "step": "net_rebate_adjustment",
            "action": "adjusted negative net_rebate to 0",
            "old_net": str(net_rebate),
            "new_net": "0.00"
        })
        net_rebate = Decimal('0.00')

    audit_trace.append({
        "step": "final_result",
        "net_rebate": str(net_rebate)
    })

    return net_rebate, audit_trace

def compare_rebate_calculations(old_params: Dict[str, Any], new_params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compares two rebate calculations and highlights differences.
    Returns a dictionary suitable for audit logging and clean frontend display.
    """
    old_net, old_trace = calculate_rebate(**old_params)
    new_net, new_trace = calculate_rebate(**new_params)

    diffs = []
    if old_net != new_net:
        diffs.append({
            "field": "net_rebate",
            "old": str(old_net),
            "new": str(new_net),
            "delta": str(new_net - old_net)
        })

    return {
        "old_net_rebate": str(old_net),
        "new_net_rebate": str(new_net),
        "differences": diffs,
        "old_trace": old_trace,
        "new_trace": new_trace
    }
