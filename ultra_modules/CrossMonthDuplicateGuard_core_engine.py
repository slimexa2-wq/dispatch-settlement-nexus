import datetime
from typing import List, Dict, Any, Tuple

def parse_date(date_str: Any) -> datetime.date:
    """
    Safely parse date string, handling dirty data and fallbacks.
    Returns epoch (1970-01-01) if parsing fails or invalid.
    """
    if not date_str:
        return datetime.date(1970, 1, 1)

    if isinstance(date_str, datetime.datetime):
        return date_str.date()
    elif isinstance(date_str, datetime.date):
        return date_str

    try:
        # Convert to string and try some common formats
        date_str = str(date_str).strip()

        # ISO format
        if 'T' in date_str:
            return datetime.datetime.fromisoformat(date_str.split('T')[0]).date()

        formats = [
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%d-%m-%Y",
            "%d/%m/%Y"
        ]

        for fmt in formats:
            try:
                return datetime.datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue

    except Exception:
        pass

    # Default fallback date if all parsing fails
    return datetime.date(1970, 1, 1)

def guard_cross_month_duplicate(
    worker_id: Any,
    project_id: Any,
    claim_date: Any,
    historical_claims: List[Dict[str, Any]] = None
) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Pure function to guard against cross-month duplicate fee claims for the same worker and project.
    Intercepts claims if there's a historical claim within 90 days.
    Includes zero-configuration auto-healing for dirty data and missing parameters.

    Args:
        worker_id: The ID of the worker. Missing/invalid values are mapped to 'unknown_worker'.
        project_id: The ID of the project. Missing/invalid values are mapped to 'unknown_project'.
        claim_date: The date of the new claim. Missing/invalid values mapped to 1970-01-01.
        historical_claims: List of past claims for this worker. Format: [{"project_id": str, "claim_date": str/date}]

    Returns:
        Tuple[bool, str, Dict[str, Any]]:
            - bool: True if passed (no duplicate), False if intercepted (duplicate).
            - str: Reason for interception or success message.
            - dict: Cleaned context data used for the decision.
    """
    # 1. Fallback & self-healing for parameters
    worker = str(worker_id).strip() if worker_id is not None and str(worker_id).strip() else "unknown_worker"
    project = str(project_id).strip() if project_id is not None and str(project_id).strip() else "unknown_project"

    current_date = parse_date(claim_date)
    history = historical_claims if isinstance(historical_claims, list) else []

    context = {
        "worker_id": worker,
        "project_id": project,
        "claim_date": current_date.isoformat(),
        "evaluated_records": 0,
        "intercepted_by_record": None
    }

    # 2. Check historical claims
    for record in history:
        if not isinstance(record, dict):
            continue

        p_id = record.get("project_id")
        record_project = str(p_id).strip() if p_id is not None else ""
        if not record_project:
            continue

        record_date = parse_date(record.get("claim_date"))
        context["evaluated_records"] += 1

        # Check matching project
        if record_project == project:
            # Check 90 days rule (3 months)
            # Use absolute difference to handle out-of-order dates smoothly
            days_diff = abs((current_date - record_date).days)

            if days_diff <= 90:
                context["intercepted_by_record"] = {
                    "project_id": record_project,
                    "claim_date": record_date.isoformat(),
                    "days_diff": days_diff
                }
                return False, f"Duplicate claim intercepted: previous claim was {days_diff} days ago (limit: 90 days).", context

    # 3. Passed
    return True, "Claim passed: No duplicate within 90 days.", context
