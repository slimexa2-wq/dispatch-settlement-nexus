import time
import copy
from typing import Dict, Any, List, Optional, Tuple

class TieredRebateCalculator:
    def __init__(self):
        self.snapshots: Dict[str, Dict[str, Any]] = {}
        self.snapshots_timestamp: Dict[str, float] = {}
        self.UNDO_WINDOW_SECONDS = 5.0

    def _sanitize_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Silently heal dirty data, apply missing parameters with sensible defaults."""
        safe_data = {}

        # worker_id handling
        worker_id = data.get("worker_id", "")
        if not isinstance(worker_id, str):
            worker_id = str(worker_id)
        safe_data["worker_id"] = worker_id.strip() if worker_id else "unknown_worker"

        # days_worked handling
        try:
            days_worked = float(data.get("days_worked", 0))
        except (ValueError, TypeError):
            days_worked = 0.0
        safe_data["days_worked"] = max(0.0, days_worked)

        # absenteeism_days handling
        try:
            absenteeism_days = float(data.get("absenteeism_days", 0))
        except (ValueError, TypeError):
            absenteeism_days = 0.0
        safe_data["absenteeism_days"] = max(0.0, absenteeism_days)

        # base_rebate_rate handling
        try:
            base_rebate_rate = float(data.get("base_rebate_rate", 10.0)) # Default $10 per day? Let's assume standard unit.
        except (ValueError, TypeError):
            base_rebate_rate = 10.0
        safe_data["base_rebate_rate"] = max(0.0, base_rebate_rate)

        # deduction_per_absent_day handling
        try:
            deduction_per_absent_day = float(data.get("deduction_per_absent_day", 50.0))
        except (ValueError, TypeError):
            deduction_per_absent_day = 50.0
        safe_data["deduction_per_absent_day"] = max(0.0, deduction_per_absent_day)

        return safe_data

    def calculate_rebate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate tiered rebates for 7/15/30/45 days and apply absenteeism deductions."""
        clean_data = self._sanitize_data(data)

        days_worked = clean_data["days_worked"]
        absenteeism_days = clean_data["absenteeism_days"]
        base_rate = clean_data["base_rebate_rate"]
        deduction_rate = clean_data["deduction_per_absent_day"]
        worker_id = clean_data["worker_id"]

        # Tiered calculation (e.g. bonus multiplier or fixed bonus)
        # We'll use a simple multiplier logic for demonstration:
        # <7 days: 0 bonus multiplier (0x)
        # >=7 days: 1.0x
        # >=15 days: 1.2x
        # >=30 days: 1.5x
        # >=45 days: 2.0x
        tier_multiplier = 0.0
        if days_worked >= 45:
            tier_multiplier = 2.0
        elif days_worked >= 30:
            tier_multiplier = 1.5
        elif days_worked >= 15:
            tier_multiplier = 1.2
        elif days_worked >= 7:
            tier_multiplier = 1.0

        base_rebate = days_worked * base_rate
        tiered_bonus = base_rebate * tier_multiplier
        total_before_deduction = base_rebate + tiered_bonus

        deduction = absenteeism_days * deduction_rate

        final_rebate = max(0.0, total_before_deduction - deduction)

        result = {
            "worker_id": worker_id,
            "days_worked": days_worked,
            "absenteeism_days": absenteeism_days,
            "tier_multiplier": tier_multiplier,
            "base_rebate": base_rebate,
            "tiered_bonus": tiered_bonus,
            "deduction": deduction,
            "final_rebate": final_rebate,
            "status": "success",
            "timestamp": time.time()
        }

        # Save snapshot for undo
        self.save_snapshot(worker_id, result)

        return result

    def save_snapshot(self, worker_id: str, state: Dict[str, Any]) -> None:
        """Save a snapshot of the calculated state for a given worker."""
        self.snapshots[worker_id] = copy.deepcopy(state)
        self.snapshots_timestamp[worker_id] = time.time()

    def undo(self, worker_id: str) -> Dict[str, Any]:
        """Restore state if invoked within 5 seconds."""
        if worker_id not in self.snapshots:
            return {"status": "error", "message": "No snapshot found for undo."}

        snapshot_time = self.snapshots_timestamp.get(worker_id, 0)
        current_time = time.time()

        if current_time - snapshot_time <= self.UNDO_WINDOW_SECONDS:
            restored_state = self.snapshots.pop(worker_id)
            self.snapshots_timestamp.pop(worker_id, None)
            restored_state["status"] = "undone"
            return restored_state
        else:
            return {"status": "error", "message": "Undo window expired."}
