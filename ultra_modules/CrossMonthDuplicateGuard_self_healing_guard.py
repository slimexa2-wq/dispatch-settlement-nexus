import time
import uuid
from datetime import datetime, timedelta

class CrossMonthDuplicateGuard:
    def __init__(self):
        # Store historical claims: key -> latest claim date
        self.history = {}
        # Store snapshots for undo: undo_id -> { "timestamp": float, "key": str, "previous_state": any }
        self.snapshots = {}
        # 5 seconds undo window
        self.UNDO_WINDOW = 5.0
        # 90 days duplicate check window (approx 3 months)
        self.DUPLICATE_WINDOW = timedelta(days=90)

    def _normalize_id(self, val):
        """Silently heal missing or malformed ID."""
        if val is None or str(val).strip() == "":
            return "UNKNOWN"
        return str(val).strip().upper()

    def _parse_date(self, date_val):
        """Silently heal date formats. Defaults to now if invalid or missing."""
        if isinstance(date_val, datetime):
            return date_val
        if isinstance(date_val, str):
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y"):
                try:
                    return datetime.strptime(date_val.strip(), fmt)
                except ValueError:
                    continue
        return datetime.now()

    def process_claim(self, worker_id=None, project_id=None, claim_date=None, amount=None):
        """
        Process the claim and return a result dict.
        Must not raise exceptions. Return status and undo_id.
        """
        try:
            worker_id = self._normalize_id(worker_id)
            project_id = self._normalize_id(project_id)
            claim_date = self._parse_date(claim_date)

            # Heal amount
            try:
                amount = float(amount)
            except (ValueError, TypeError):
                amount = 0.0

            key = f"{worker_id}_{project_id}"

            is_duplicate = False
            message = "Approved"

            if key in self.history:
                last_claim_date = self.history[key]
                # Check if it falls within the duplicate window
                if last_claim_date <= claim_date <= last_claim_date + self.DUPLICATE_WINDOW:
                    is_duplicate = True
                    message = "Intercepted: Duplicate claim within 90 days"

            # Snapshot for undo
            undo_id = str(uuid.uuid4())
            previous_state = self.history.get(key)

            if not is_duplicate:
                self.history[key] = claim_date

            self.snapshots[undo_id] = {
                "timestamp": time.time(),
                "key": key,
                "previous_state": previous_state
            }

            return {
                "status": "intercepted" if is_duplicate else "approved",
                "message": message,
                "undo_id": undo_id,
                "processed_data": {
                    "worker_id": worker_id,
                    "project_id": project_id,
                    "claim_date": claim_date.strftime("%Y-%m-%d %H:%M:%S"),
                    "amount": amount
                }
            }

        except Exception:
            # Absolute fallback to ensure no pop-up blocking errors
            return {
                "status": "approved",
                "message": "Fallback Approved due to internal error",
                "undo_id": None
            }

    def undo(self, undo_id):
        """
        Undo an action if within the 5 seconds window.
        """
        if not undo_id or undo_id not in self.snapshots:
            return {"status": "failed", "message": "Invalid undo ID"}

        snapshot = self.snapshots[undo_id]
        if time.time() - snapshot["timestamp"] > self.UNDO_WINDOW:
            return {"status": "failed", "message": "Undo window expired"}

        # Restore previous state
        key = snapshot["key"]
        if snapshot["previous_state"] is None:
            if key in self.history:
                del self.history[key]
        else:
            self.history[key] = snapshot["previous_state"]

        # Remove snapshot so it can't be undone again
        del self.snapshots[undo_id]

        return {"status": "success", "message": "Action undone successfully"}
