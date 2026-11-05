import io
import csv
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

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
    Includes background silent audit tracing, schema version mapping,
    and Excel (CSV) export capabilities.
    """
    def __init__(self, management_fee_rate: float = 0.05, tax_rate: float = 0.06):
        self.default_management_fee_rate = Decimal(str(management_fee_rate))
        self.default_tax_rate = Decimal(str(tax_rate))

    def _safe_decimal(self, value: Any, default: Decimal) -> Decimal:
        """Safe conversion to Decimal."""
        if value is None:
            return default
        try:
            if isinstance(value, str):
                value = value.replace('￥', '').replace('¥', '').replace(',', '').strip()
                if not value:
                    return default
            d = Decimal(str(value))
            if d.is_nan() or d.is_infinite():
                return default
            return d
        except (InvalidOperation, ValueError, TypeError):
            return default

    def _map_schema(self, record: Dict[str, Any], audit_log: AuditLog, emp_id: str) -> Dict[str, Any]:
        """Silent schema mapping from old and new versions."""
        mapped = {}

        # Mapping hours
        if "hours" in record:
            mapped["hours"] = record["hours"]
        elif "work_hours" in record:
            mapped["hours"] = record["work_hours"]
            audit_log.add("SCHEMA_MAPPING", {"action": "mapped_work_hours_to_hours", "emp_id": emp_id})
        else:
            mapped["hours"] = 0

        # Mapping hourly rate
        if "hourly_rate" in record:
            mapped["hourly_rate"] = record["hourly_rate"]
        elif "base_rate" in record:
            mapped["hourly_rate"] = record["base_rate"]
            audit_log.add("SCHEMA_MAPPING", {"action": "mapped_base_rate_to_hourly_rate", "emp_id": emp_id})
        else:
            mapped["hourly_rate"] = 0

        # Mapping name
        if "name" in record:
            mapped["name"] = record["name"]
        elif "employee_name" in record:
            mapped["name"] = record["employee_name"]
        else:
            mapped["name"] = f"Employee {emp_id}"

        return mapped

    def generate(self, raw_data: Optional[List[Any]] = None, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Generate bill summary from raw timesheet data.
        """
        audit_log = AuditLog()
        audit_log.add("INITIALIZATION", {"raw_data_count": len(raw_data) if raw_data is not None else 0, "config": config})

        # 1. Fallbacks for missing parameters
        config = config or {}

        management_fee_rate = self._safe_decimal(config.get("management_fee_rate"), self.default_management_fee_rate)
        if management_fee_rate < 0 or management_fee_rate > 1:
            management_fee_rate = self.default_management_fee_rate
            audit_log.add("FALLBACK_CONFIG", {"param": "management_fee_rate", "applied_value": str(management_fee_rate)})

        tax_rate = self._safe_decimal(config.get("tax_rate"), self.default_tax_rate)
        if tax_rate < 0 or tax_rate > 1:
            tax_rate = self.default_tax_rate
            audit_log.add("FALLBACK_CONFIG", {"param": "tax_rate", "applied_value": str(tax_rate)})

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

            mapped_record = self._map_schema(record, audit_log, emp_id)

            hours = self._safe_decimal(mapped_record["hours"], Decimal('0.0'))
            if hours < 0:
                hours = Decimal('0.0')
                audit_log.add("DATA_CLEANING", {"action": "fix_negative_hours", "emp_id": emp_id})

            hourly_rate = self._safe_decimal(mapped_record["hourly_rate"], Decimal('0.0'))
            if hourly_rate < 0:
                hourly_rate = Decimal('0.0')
                audit_log.add("DATA_CLEANING", {"action": "fix_negative_rate", "emp_id": emp_id})

            # Deduplication: aggregate hours for the same employee
            if emp_id in processed_records:
                duplicate_count += 1
                audit_log.add("DEDUPLICATION", {"action": "merge_duplicate_emp", "emp_id": emp_id, "added_hours": str(hours)})
                processed_records[emp_id]["hours"] += hours
                # use max rate if different
                if hourly_rate > processed_records[emp_id]["hourly_rate"]:
                    processed_records[emp_id]["hourly_rate"] = hourly_rate
                    audit_log.add("DEDUPLICATION", {"action": "update_rate_to_max", "emp_id": emp_id, "new_rate": str(hourly_rate)})
            else:
                processed_records[emp_id] = {
                    "employee_id": emp_id,
                    "name": mapped_record["name"],
                    "hours": hours,
                    "hourly_rate": hourly_rate
                }

        audit_log.add("CLEANING_SUMMARY", {"dirty_fixed": dirty_count, "duplicates_merged": duplicate_count})

        # 3. Calculation
        total_hours = Decimal('0.0')
        base_cost = Decimal('0.0')

        valid_details = []
        for emp_id, data in processed_records.items():
            cost = (data["hours"] * data["hourly_rate"]).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            total_hours += data["hours"]
            base_cost += cost
            valid_details.append({
                "employee_id": emp_id,
                "name": data["name"],
                "hours": float(data["hours"]),
                "hourly_rate": float(data["hourly_rate"]),
                "subtotal": float(cost)
            })

        management_fee = (base_cost * management_fee_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        pre_tax_total = base_cost + management_fee
        tax_amount = (pre_tax_total * tax_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        grand_total = pre_tax_total + tax_amount

        audit_log.add("CALCULATION_STEP", {
            "base_cost": str(base_cost),
            "management_fee_rate": str(management_fee_rate),
            "management_fee": str(management_fee),
            "pre_tax_total": str(pre_tax_total),
            "tax_rate": str(tax_rate),
            "tax_amount": str(tax_amount),
            "grand_total": str(grand_total)
        })

        # 4. Generate CSV
        csv_buffer = io.StringIO()
        csv_writer = csv.writer(csv_buffer)
        csv_writer.writerow(["Employee ID", "Name", "Hours", "Hourly Rate", "Subtotal"])
        for detail in sorted(valid_details, key=lambda x: x["employee_id"]):
            csv_writer.writerow([
                detail["employee_id"],
                detail["name"],
                detail["hours"],
                detail["hourly_rate"],
                detail["subtotal"]
            ])
        csv_writer.writerow([])
        csv_writer.writerow(["Total Employees", len(valid_details)])
        csv_writer.writerow(["Total Hours", float(total_hours)])
        csv_writer.writerow(["Base Cost", float(base_cost)])
        csv_writer.writerow(["Management Fee", float(management_fee)])
        csv_writer.writerow(["Tax Amount", float(tax_amount)])
        csv_writer.writerow(["Grand Total", float(grand_total)])

        result = {
            "status": "success",
            "summary": {
                "total_employees": len(valid_details),
                "total_hours": float(total_hours),
                "base_cost": float(base_cost),
                "management_fee": float(management_fee),
                "tax_amount": float(tax_amount),
                "grand_total": float(grand_total)
            },
            "details": sorted(valid_details, key=lambda x: x["employee_id"]),
            "csv_export": csv_buffer.getvalue(),
            "_audit_trace": audit_log.logs
        }

        return result
