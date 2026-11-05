import datetime
from typing import Dict, List, Any

class CrossMonthDuplicateGuardAuditTrace:
    """
    Cross 3-months historical settlement duplicate claim interceptor for same worker & same project.
    Provides backend full-link traceable audit log and difference highlighter.
    """

    @staticmethod
    def _parse_date(date_val: Any, default_date: datetime.date) -> datetime.date:
        if not date_val:
            return default_date
        if isinstance(date_val, datetime.date):
            return date_val
        if isinstance(date_val, datetime.datetime):
            return date_val.date()
        if isinstance(date_val, str):
            try:
                # Handle basic ISO formats
                parsed = datetime.datetime.fromisoformat(date_val.replace('Z', '+00:00'))
                return parsed.date()
            except ValueError:
                pass
        return default_date

    @staticmethod
    def _sanitize_string(val: Any) -> str:
        if not val:
            return ""
        return str(val).strip().lower()

    @classmethod
    def evaluate(cls, current_claim: Dict[str, Any], historical_claims: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Evaluate if the current claim is a duplicate within a 3-month (90-day) window.
        Returns a dictionary with 'frontend_result' and 'backend_audit_trace'.
        """
        if historical_claims is None:
            historical_claims = []

        audit_trace = []
        today = datetime.date.today()

        # 1. Sanitize current claim
        audit_trace.append({"step": "sanitize_current_claim", "input": current_claim})

        # self heal missing dictionary
        if not isinstance(current_claim, dict):
            audit_trace.append({"action": "self_heal", "issue": "current_claim_not_dict", "fallback": {}})
            current_claim = {}

        worker_id = cls._sanitize_string(current_claim.get('worker_id'))
        project_id = cls._sanitize_string(current_claim.get('project_id'))
        claim_date = cls._parse_date(current_claim.get('claim_date'), today)

        if not worker_id:
            worker_id = "unknown_worker"
            audit_trace.append({"action": "self_heal", "field": "worker_id", "fallback": worker_id})

        if not project_id:
            project_id = "unknown_project"
            audit_trace.append({"action": "self_heal", "field": "project_id", "fallback": project_id})

        sanitized_current = {
            "worker_id": worker_id,
            "project_id": project_id,
            "claim_date": claim_date.isoformat()
        }
        audit_trace.append({"step": "sanitized_current_claim", "result": sanitized_current})

        # 2. Process historical claims
        if not isinstance(historical_claims, list):
            audit_trace.append({"action": "self_heal", "issue": "historical_claims_not_list", "fallback": []})
            historical_claims = []

        duplicate_found = False
        duplicate_record = None
        differences = []

        for idx, h_claim in enumerate(historical_claims):
            if not isinstance(h_claim, dict):
                audit_trace.append({"step": f"skip_invalid_historical_{idx}", "issue": "not_dict"})
                continue

            h_worker_id = cls._sanitize_string(h_claim.get('worker_id'))
            h_project_id = cls._sanitize_string(h_claim.get('project_id'))
            h_claim_date = cls._parse_date(h_claim.get('claim_date'), datetime.date.min)

            match_worker = (h_worker_id == worker_id)
            match_project = (h_project_id == project_id)

            days_diff = (claim_date - h_claim_date).days
            # Check strictly within 90 days inclusive
            within_window = (0 <= days_diff <= 90)

            trace_entry = {
                "historical_index": idx,
                "original_record": h_claim,
                "parsed_worker_id": h_worker_id,
                "parsed_project_id": h_project_id,
                "parsed_claim_date": h_claim_date.isoformat(),
                "comparisons": {
                    "worker_match": match_worker,
                    "project_match": match_project,
                    "days_difference": days_diff,
                    "within_90_days": within_window
                }
            }
            audit_trace.append({"step": f"evaluate_historical_{idx}", "trace": trace_entry})

            if match_worker and match_project and within_window:
                duplicate_found = True
                duplicate_record = h_claim
                differences = [
                    f"Worker '{worker_id}' project '{project_id}' duplicate claim.",
                    f"Historical claim date: {h_claim_date.isoformat()}.",
                    f"Current claim date: {claim_date.isoformat()}.",
                    f"Difference: {days_diff} days (<= 90 days)."
                ]
                audit_trace.append({"step": "duplicate_detected", "details": trace_entry})
                break

        # Frontend result must be clean and minimal
        frontend_result = {
            "is_duplicate": duplicate_found,
            "allow_claim": not duplicate_found,
            "message": "Duplicate claim detected within 3 months." if duplicate_found else "Claim allowed."
        }

        return {
            "frontend_result": frontend_result,
            "backend_audit_trace": {
                "steps": audit_trace,
                "differences_highlighted": differences,
                "duplicate_record": duplicate_record
            }
        }
