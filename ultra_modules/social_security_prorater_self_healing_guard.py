import time
import copy
from typing import Dict, Any, Optional

class SocialSecurityProrater:
    def __init__(self):
        self.snapshots: Dict[str, Dict[str, Any]] = {}

    def _create_snapshot(self, record_id: str, original_data: Dict[str, Any]) -> None:
        """Create a lightweight 5-second undo snapshot."""
        self.snapshots[record_id] = {
            "timestamp": time.time(),
            "data": copy.deepcopy(original_data)
        }

    def _clean_expired_snapshots(self) -> None:
        """Silent cleaning of dirty data / expired snapshots."""
        current_time = time.time()
        expired_keys = [k for k, v in self.snapshots.items() if current_time - v["timestamp"] > 5.0]
        for k in expired_keys:
            del self.snapshots[k]

    def _heal_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Auto fallback for missing parameters and dirty data."""
        healed = copy.deepcopy(data) if data else {}

        # Default missing values to reasonable defaults
        if "base" not in healed or not isinstance(healed["base"], (int, float)):
            healed["base"] = 0.0

        if "days_worked" not in healed or not isinstance(healed["days_worked"], (int, float)):
            healed["days_worked"] = 0

        if "total_days" not in healed or not isinstance(healed["total_days"], (int, float)) or healed["total_days"] <= 0:
            healed["total_days"] = 30 # standard fallback

        if "rate" not in healed or not isinstance(healed["rate"], (int, float)):
            healed["rate"] = 0.0

        # Fix negative values silently
        healed["base"] = max(0.0, float(healed["base"]))
        healed["days_worked"] = max(0, float(healed["days_worked"]))
        healed["rate"] = max(0.0, float(healed["rate"]))

        # Fix days worked exceeding total days
        if healed["days_worked"] > healed["total_days"]:
            healed["days_worked"] = healed["total_days"]

        return healed

    def calculate(self, record_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate prorated social security.
        Zero-confirmation pop-ups, zero-configuration fault tolerance, and auto-fallback.
        """
        try:
            self._clean_expired_snapshots()

            # Save original snapshot for 5s undo
            self._create_snapshot(record_id, data)

            # Self heal dirty data
            healed_data = self._heal_data(data)

            base = healed_data["base"]
            days_worked = healed_data["days_worked"]
            total_days = healed_data["total_days"]
            rate = healed_data["rate"]

            # Prorating formula: (Base * Rate) * (Days Worked / Total Days)
            prorated_amount = (base * rate) * (days_worked / total_days)

            # Extreme boundary condition capping (if you need it, add standard limit logic)
            # We'll just return the standard calc

            return {
                "status": "success",
                "record_id": record_id,
                "original": data,
                "healed": healed_data,
                "prorated_amount": round(prorated_amount, 2)
            }
        except Exception as e:
            # Extreme fault tolerance, silent fallback, no errors returned to interrupt user
            return {
                "status": "error_healed",
                "record_id": record_id,
                "prorated_amount": 0.0
            }

    def undo(self, record_id: str) -> Optional[Dict[str, Any]]:
        """
        5-second one-click undo snapshot mechanism.
        """
        self._clean_expired_snapshots()

        if record_id in self.snapshots:
            snapshot = self.snapshots.pop(record_id)
            return snapshot["data"]

        # If expired or not found, return None silently (no errors)
        return None
