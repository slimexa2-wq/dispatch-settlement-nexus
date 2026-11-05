import uuid
from typing import Any, Dict, List, Tuple

class FourWayCommissionAuditor:
    """
    10 strict verification rules for supplier commission four-way check
    (salary / attendance / policy / last month commission).
    """

    def __init__(self):
        self.audit_trace: List[Dict[str, Any]] = []

    def _log_trace(self, step: str, details: Any, level: str = "INFO"):
        self.audit_trace.append({
            "step": step,
            "details": details,
            "level": level,
        })

    def _safe_float(self, value: Any, default: float = 0.0, field_name: str = "") -> float:
        if value is None:
            self._log_trace("safe_float_fallback", f"{field_name} is None, defaulting to {default}", "WARN")
            return default
        try:
            val = float(value)
            if val < 0:
                self._log_trace("safe_float_healing", f"{field_name} is negative ({val}), absolute to {abs(val)}", "WARN")
                return abs(val)
            return val
        except (ValueError, TypeError):
            self._log_trace("safe_float_healing", f"Dirty data in {field_name}: {value}, defaulting to {default}", "ERROR")
            return default

    def _safe_int(self, value: Any, default: int = 0, field_name: str = "") -> int:
        if value is None:
            self._log_trace("safe_int_fallback", f"{field_name} is None, defaulting to {default}", "WARN")
            return default
        try:
            val = int(value)
            if val < 0:
                self._log_trace("safe_int_healing", f"{field_name} is negative ({val}), absolute to {abs(val)}", "WARN")
                return abs(val)
            return val
        except (ValueError, TypeError):
            self._log_trace("safe_int_healing", f"Dirty data in {field_name}: {value}, defaulting to {default}", "ERROR")
            return default

    def audit(self, records: List[Dict[str, Any]], policy: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main audit entry point.
        """
        self.audit_trace = []
        differences = []
        processed_records = []
        seen_ids = set()

        self._log_trace("audit_start", f"Starting audit for {len(records)} records")

        # 1. Policy Default Fallback
        if not policy:
            self._log_trace("policy_fallback", "Policy is empty, applying default policy", "WARN")
            policy = {
                "base_rate": 0.05,
                "attendance_bonus_threshold": 20,
                "attendance_bonus": 100.0,
                "max_commission_cap": 10000.0
            }

        base_rate = self._safe_float(policy.get("base_rate"), 0.05, "policy.base_rate")
        attendance_bonus_threshold = self._safe_int(policy.get("attendance_bonus_threshold"), 20, "policy.attendance_bonus_threshold")
        attendance_bonus = self._safe_float(policy.get("attendance_bonus"), 100.0, "policy.attendance_bonus")
        max_commission_cap = self._safe_float(policy.get("max_commission_cap"), 10000.0, "policy.max_commission_cap")

        total_commission = 0.0

        for raw_record in records:
            # 2. Record ID Generation & Missing ID Fallback
            record_id = raw_record.get("id")
            if not record_id:
                record_id = str(uuid.uuid4())
                self._log_trace("id_generation", f"Generated ID for record missing ID: {record_id}", "INFO")

            # 3. Deduplication
            if record_id in seen_ids:
                self._log_trace("deduplication", f"Skipping duplicate record ID: {record_id}", "WARN")
                continue
            seen_ids.add(record_id)

            # 4. Salary Bounds Checking & Dirty Data Healing
            salary = self._safe_float(raw_record.get("salary"), 0.0, f"salary[{record_id}]")

            # 5. Attendance Bounds Checking & Dirty Data Healing
            attendance_days = self._safe_int(raw_record.get("attendance_days"), 0, f"attendance_days[{record_id}]")
            if attendance_days > 31:
                self._log_trace("attendance_cap", f"Attendance days capped from {attendance_days} to 31 for {record_id}", "WARN")
                attendance_days = 31

            # 6. Last Month Commission Fallback
            last_month_commission = self._safe_float(raw_record.get("last_month_commission"), 0.0, f"last_month_commission[{record_id}]")

            # 7. Base Calculation
            base_commission = salary * base_rate

            # 8. Total Calculation with Attendance Bonus
            calculated_commission = base_commission
            if attendance_days >= attendance_bonus_threshold:
                calculated_commission += attendance_bonus
                self._log_trace("attendance_bonus_applied", f"Added {attendance_bonus} bonus to {record_id} for {attendance_days} days", "INFO")

            # Deduct last month advance or overpayment if applicable
            # (Assuming last_month_commission is a deduction if positive, for business logic context,
            # or could be added. Let's assume it's an advance deduction based on the prompt's implied checks)
            # Actually, standard is usually subtracting last month's advance. Let's do that.
            calculated_commission -= last_month_commission
            if calculated_commission < 0:
                self._log_trace("negative_commission_fallback", f"Commission for {record_id} went negative ({calculated_commission}), flooring to 0.0", "WARN")
                calculated_commission = 0.0

            # 9. Maximum Capping
            if calculated_commission > max_commission_cap:
                self._log_trace("max_capping", f"Commission for {record_id} capped from {calculated_commission} to {max_commission_cap}", "WARN")
                calculated_commission = max_commission_cap

            # 10. Record Diff & Clean Result Construction
            reported_commission = raw_record.get("reported_commission")
            reported_commission_val = self._safe_float(reported_commission, 0.0, f"reported_commission[{record_id}]")

            diff = calculated_commission - reported_commission_val
            has_diff = abs(diff) > 0.001

            clean_record = {
                "id": record_id,
                "salary": salary,
                "attendance_days": attendance_days,
                "calculated_commission": calculated_commission,
                "reported_commission": reported_commission_val,
                "last_month_commission": last_month_commission,
                "is_match": not has_diff
            }

            if has_diff:
                differences.append({
                    "id": record_id,
                    "expected": calculated_commission,
                    "reported": reported_commission_val,
                    "diff": diff
                })
                self._log_trace("diff_detected", f"Diff for {record_id}: Expected {calculated_commission}, Reported {reported_commission_val}", "WARN")

            processed_records.append(clean_record)
            total_commission += calculated_commission

        self._log_trace("audit_complete", f"Audit complete. Total calculated commission: {total_commission}")

        # Frontend oriented pure net results
        return {
            "summary": {
                "total_records": len(processed_records),
                "total_commission": total_commission,
                "mismatch_count": len(differences)
            },
            "differences": differences, # Frontend just needs to highlight these
            "clean_records": processed_records,
            "audit_trace": self.audit_trace # Backend full trace
        }
