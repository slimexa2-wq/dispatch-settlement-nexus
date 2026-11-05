import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime

class AuditLog:
    def __init__(self):
        self.logs = []

    def add(self, step: str, details: Dict[str, Any]):
        self.logs.append({
            "timestamp": datetime.now().isoformat(),
            "step": step,
            "details": details
        })

class ClientBillSummaryGenerator:
    """
    Generator for Client Monthly Bill Summary.
    Handles timesheet details, management fees, and taxes.
    Includes background silent audit tracing.
    """
    def __init__(self, management_fee_rate: float = 0.05, tax_rate: float = 0.06):
        self.default_management_fee_rate = management_fee_rate
        self.default_tax_rate = tax_rate

    def generate(self, raw_data: Optional[List[Any]], config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Generate bill summary from raw timesheet data.
        """
        audit_log = AuditLog()
        audit_log.add("INITIALIZATION", {"raw_data_count": len(raw_data) if raw_data is not None else 0, "config": config})

        # 1. Fallbacks for missing parameters
        config = config or {}
        management_fee_rate = config.get("management_fee_rate")
        if management_fee_rate is None or not isinstance(management_fee_rate, (int, float)) or management_fee_rate < 0:
            management_fee_rate = self.default_management_fee_rate
            audit_log.add("FALLBACK_CONFIG", {"param": "management_fee_rate", "applied_value": management_fee_rate})

        tax_rate = config.get("tax_rate")
        if tax_rate is None or not isinstance(tax_rate, (int, float)) or tax_rate < 0:
            tax_rate = self.default_tax_rate
            audit_log.add("FALLBACK_CONFIG", {"param": "tax_rate", "applied_value": tax_rate})

        # 2. Data cleaning and deduplication
        processed_records = {}
        dirty_count = 0
        duplicate_count = 0

        for idx, record in enumerate(raw_data or []):
            if not isinstance(record, dict):
                dirty_count += 1
                audit_log.add("DATA_CLEANING", {"action": "drop_invalid_record_type", "index": idx})
                continue

            emp_id = record.get("employee_id")
            if not emp_id:
                emp_id = f"UNKNOWN_{uuid.uuid4().hex[:8]}"
                audit_log.add("DATA_CLEANING", {"action": "auto_assign_emp_id", "original_index": idx, "new_emp_id": emp_id})

            # Clean hours
            raw_hours = record.get("hours", 0)
            try:
                hours = float(raw_hours)
                if hours < 0:
                    hours = 0.0
                    audit_log.add("DATA_CLEANING", {"action": "fix_negative_hours", "emp_id": emp_id})
            except (ValueError, TypeError):
                hours = 0.0
                dirty_count += 1
                audit_log.add("DATA_CLEANING", {"action": "fix_invalid_hours", "emp_id": emp_id, "raw_val": raw_hours})

            # Clean hourly rate
            raw_rate = record.get("hourly_rate", 0)
            try:
                hourly_rate = float(raw_rate)
                if hourly_rate < 0:
                    hourly_rate = 0.0
                    audit_log.add("DATA_CLEANING", {"action": "fix_negative_rate", "emp_id": emp_id})
            except (ValueError, TypeError):
                hourly_rate = 0.0
                dirty_count += 1
                audit_log.add("DATA_CLEANING", {"action": "fix_invalid_rate", "emp_id": emp_id, "raw_val": raw_rate})

            # Deduplication: aggregate hours for the same employee
            if emp_id in processed_records:
                duplicate_count += 1
                audit_log.add("DEDUPLICATION", {"action": "merge_duplicate_emp", "emp_id": emp_id, "added_hours": hours})
                processed_records[emp_id]["hours"] += hours
                # use max rate if different
                if hourly_rate > processed_records[emp_id]["hourly_rate"]:
                    processed_records[emp_id]["hourly_rate"] = hourly_rate
                    audit_log.add("DEDUPLICATION", {"action": "update_rate_to_max", "emp_id": emp_id, "new_rate": hourly_rate})
            else:
                processed_records[emp_id] = {
                    "employee_id": emp_id,
                    "name": record.get("name", f"Employee {emp_id}"),
                    "hours": hours,
                    "hourly_rate": hourly_rate
                }

        audit_log.add("CLEANING_SUMMARY", {"dirty_fixed": dirty_count, "duplicates_merged": duplicate_count})

        # 3. Calculation
        total_hours = 0.0
        base_cost = 0.0

        valid_details = []
        for emp_id, data in processed_records.items():
            cost = data["hours"] * data["hourly_rate"]
            total_hours += data["hours"]
            base_cost += cost
            valid_details.append({
                "employee_id": emp_id,
                "name": data["name"],
                "hours": round(data["hours"], 2),
                "hourly_rate": round(data["hourly_rate"], 2),
                "subtotal": round(cost, 2)
            })

        management_fee = base_cost * management_fee_rate
        pre_tax_total = base_cost + management_fee
        tax_amount = pre_tax_total * tax_rate
        grand_total = pre_tax_total + tax_amount

        audit_log.add("CALCULATION_STEP", {
            "base_cost": base_cost,
            "management_fee_rate": management_fee_rate,
            "management_fee": management_fee,
            "pre_tax_total": pre_tax_total,
            "tax_rate": tax_rate,
            "tax_amount": tax_amount,
            "grand_total": grand_total
        })

        # Return clean result, frontend won't see audit_log directly in the main summary,
        # but we can return it as a separate field or metadata so the backend can log it.
        result = {
            "status": "success",
            "summary": {
                "total_employees": len(valid_details),
                "total_hours": round(total_hours, 2),
                "base_cost": round(base_cost, 2),
                "management_fee": round(management_fee, 2),
                "tax_amount": round(tax_amount, 2),
                "grand_total": round(grand_total, 2)
            },
            "details": sorted(valid_details, key=lambda x: x["employee_id"]),
            "_audit_trace": audit_log.logs  # backend can persist this to db
        }

        return result
