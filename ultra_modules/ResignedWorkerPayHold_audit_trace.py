import math
from typing import Dict, Any, List

def _clean_float(value: Any, default: float = 0.0) -> float:
    """
    Safely converts a value to float, defaulting to `default` if invalid, missing, or negative.
    """
    try:
        if value is None:
            return default
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return default
        return max(0.0, val)
    except (ValueError, TypeError):
        return default

def reconcile_pay_hold(data: Dict[str, Any] = None, **kwargs) -> Dict[str, Any]:
    """
    Resigned worker pay hold reconciliation and compliance verification.
    Automatically self-heals missing/dirty data, computes maximum compliant deductions,
    and returns a clean result with a backend audit trace.
    """
    if data is None:
        data = {}

    # Merge kwargs into data to support flexible invocation
    payload = {**data, **kwargs}

    audit_trace: List[str] = []
    audit_trace.append("Initialization: Commencing data validation and auto-correction.")

    # 1. Clean worker_id
    raw_worker_id = payload.get("worker_id")
    worker_id = str(raw_worker_id).strip() if raw_worker_id is not None else ""
    if not worker_id or worker_id == "None":
        worker_id = "UNKNOWN_WORKER"
        audit_trace.append("Auto-corrected invalid or missing worker_id to 'UNKNOWN_WORKER'.")

    # 2. Clean unissued_salary
    raw_salary = payload.get("unissued_salary")
    unissued_salary = _clean_float(raw_salary, 0.0)
    if unissued_salary != raw_salary:
        audit_trace.append(f"Auto-corrected unissued_salary from {raw_salary} to {unissued_salary}.")

    # 3. Clean requested_deduction
    raw_deduction = payload.get("requested_deduction")
    requested_deduction = _clean_float(raw_deduction, 0.0)
    if requested_deduction != raw_deduction:
        audit_trace.append(f"Auto-corrected requested_deduction from {raw_deduction} to {requested_deduction}.")

    # 4. Clean and enforce max_deduction_ratio (Default compliance limit: 20%)
    raw_ratio = payload.get("max_deduction_ratio")
    max_deduction_ratio = _clean_float(raw_ratio, 0.2)
    max_deduction_ratio = min(1.0, max(0.0, max_deduction_ratio)) # bounded between 0% and 100%
    if raw_ratio != max_deduction_ratio:
         audit_trace.append(f"Auto-corrected max_deduction_ratio from {raw_ratio} to {max_deduction_ratio}.")

    # 5. Core logic: calculate limits
    compliance_limit = round(unissued_salary * max_deduction_ratio, 2)
    audit_trace.append(f"Computed statutory compliance deduction limit: {compliance_limit} based on {max_deduction_ratio*100}% ratio.")

    # deduction cannot exceed statutory limit, nor can it result in negative salary
    allowed_deduction = min(requested_deduction, compliance_limit)
    allowed_deduction = min(allowed_deduction, unissued_salary)

    # Ensure allowed deduction is rounded
    allowed_deduction = round(allowed_deduction, 2)

    # 6. Audit & Cap reasoning
    is_capped = allowed_deduction < requested_deduction
    cap_reason = None

    if is_capped:
        if requested_deduction > unissued_salary and unissued_salary <= compliance_limit:
            cap_reason = "Exceeded available unissued salary"
            audit_trace.append(f"Deduction capped: Requested {requested_deduction} exceeds unissued salary {unissued_salary}.")
        elif requested_deduction > compliance_limit:
            cap_reason = "Exceeded statutory compliance limit"
            audit_trace.append(f"Deduction capped: Requested {requested_deduction} exceeds compliance limit {compliance_limit}.")

    final_pay = max(0.0, round(unissued_salary - allowed_deduction, 2))
    audit_trace.append(f"Reconciliation successful. Final pay set to {final_pay} after allowed deduction {allowed_deduction}.")

    return {
        "worker_id": worker_id,
        "original_unissued_salary": unissued_salary,
        "requested_deduction": requested_deduction,
        "allowed_deduction": allowed_deduction,
        "final_pay": final_pay,
        "is_capped": is_capped,
        "diff_highlight": {
            "requested_vs_allowed_diff": round(requested_deduction - allowed_deduction, 2),
            "cap_reason": cap_reason
        },
        "audit_trace": audit_trace
    }
