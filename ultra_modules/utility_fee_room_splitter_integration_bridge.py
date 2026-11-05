import logging
from typing import Dict, List, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UtilityFeeSplitter:
    """
    Utility Fee / Management Fee Splitter for dormitory rooms based on actual days lived.
    Provides forward-compatibility and self-healing for schema versions.
    """

    def __init__(self):
        self.audit_log: List[Dict[str, Any]] = []

    def _log_audit(self, action: str, details: Dict[str, Any]):
        """Silently generate a full-link traceable audit log."""
        self.audit_log.append({
            "action": action,
            "details": details
        })

    def get_audit_log(self) -> List[Dict[str, Any]]:
        """Return the audit log."""
        return self.audit_log

    def _parse_days(self, record: Dict[str, Any]) -> int:
        """Extract and normalize days lived from record."""
        # Handle new vs old schema:
        # new schema might use 'days_lived' or 'actual_days'
        # old schema might use 'days'
        days = record.get("days_lived") or record.get("actual_days") or record.get("days")

        # Self-healing: if no days, default to 0
        if days is None:
            return 0

        try:
            days_int = int(float(days))
            # Extreme boundaries: days cannot be negative, max could be 31 for a month but we cap at a reasonable large number if needed.
            # Let's just say no negative days.
            return max(0, days_int)
        except (ValueError, TypeError):
            return 0

    def _parse_fee(self, fee_data: Any) -> float:
        """Extract and normalize total fee."""
        if fee_data is None:
            return 0.0

        if isinstance(fee_data, dict):
            # Might be a nested struct like {"amount": 100, "currency": "RMB"}
            val = fee_data.get("amount") or fee_data.get("value") or fee_data.get("total")
        else:
            val = fee_data

        try:
            return max(0.0, float(val))
        except (ValueError, TypeError):
            return 0.0

    def calculate_splits(self, total_fee: Any, residents: List[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Calculate fee split among residents based on actual days lived.
        Handles zero-configuration fault tolerance and missing parameter fallbacks.
        """
        # Default config
        config = config or {}
        precision = config.get("precision", 2)

        fee_amount = self._parse_fee(total_fee)
        self._log_audit("parse_total_fee", {"input": total_fee, "parsed": fee_amount})

        if not residents:
            self._log_audit("no_residents", {"fee": fee_amount})
            return {
                "total_fee": fee_amount,
                "splits": [],
                "unallocated_fee": round(fee_amount, precision),
                "total_days": 0
            }

        # Deduplicate residents based on 'id' or 'user_id' or 'resident_id'
        seen_ids = set()
        unique_residents = []
        for r in residents:
            rid = r.get("id") or r.get("user_id") or r.get("resident_id")
            if not rid:
                # Generate a dummy id if missing for self-healing
                rid = f"unknown_{len(seen_ids)}"

            if rid not in seen_ids:
                seen_ids.add(rid)
                unique_residents.append({"id": rid, "original": r})
            else:
                self._log_audit("duplicate_resident_ignored", {"id": rid})

        total_days = 0
        parsed_residents = []
        for ur in unique_residents:
            days = self._parse_days(ur["original"])
            total_days += days
            parsed_residents.append({
                "id": ur["id"],
                "days": days
            })

        self._log_audit("parse_residents", {"total_days": total_days, "residents_count": len(parsed_residents)})

        splits = []
        unallocated_fee = fee_amount

        if total_days > 0:
            allocated = 0.0
            for i, pr in enumerate(parsed_residents):
                if i == len(parsed_residents) - 1:
                    # Last person gets the remainder to avoid rounding issues
                    split_amount = round(fee_amount - allocated, precision)
                else:
                    split_amount = round(fee_amount * (pr["days"] / total_days), precision)

                allocated += split_amount

                splits.append({
                    "id": pr["id"],
                    "fee": split_amount,
                    "days": pr["days"]
                })
            unallocated_fee = round(fee_amount - allocated, precision)
        else:
            # If total_days is 0, no one lived there, fee is unallocated, or we split evenly?
            # Standard requirement says split by actual days lived. If all days are 0, we can either leave it unallocated or split evenly.
            # We will split evenly as a fallback if the config allows, otherwise leave unallocated.
            fallback = config.get("zero_days_fallback", "unallocated")
            if fallback == "even":
                allocated = 0.0
                num_res = len(parsed_residents)
                for i, pr in enumerate(parsed_residents):
                    if i == num_res - 1:
                        split_amount = round(fee_amount - allocated, precision)
                    else:
                        split_amount = round(fee_amount / num_res, precision)
                    allocated += split_amount
                    splits.append({
                        "id": pr["id"],
                        "fee": split_amount,
                        "days": 0
                    })
                unallocated_fee = round(fee_amount - allocated, precision)
            else:
                for pr in parsed_residents:
                    splits.append({
                        "id": pr["id"],
                        "fee": 0.0,
                        "days": 0
                    })

        self._log_audit("calculation_complete", {
            "splits": splits,
            "unallocated_fee": unallocated_fee
        })

        return {
            "total_fee": round(fee_amount, precision),
            "splits": splits,
            "unallocated_fee": unallocated_fee,
            "total_days": total_days
        }
