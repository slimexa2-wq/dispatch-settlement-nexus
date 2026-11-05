import time
import uuid
import logging
from datetime import datetime
from collections import defaultdict
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class HourlyRateJumpGuard:
    def __init__(self, jump_threshold_ratio: float = 0.5):
        self.jump_threshold_ratio = jump_threshold_ratio
        # Store snapshots for the 5-second one-click undo mechanism
        self._snapshots = {}

    def _parse_date(self, date_val: Any) -> Optional[datetime]:
        """Silent self-healing for dates."""
        if not date_val:
            return None
        if isinstance(date_val, datetime):
            return date_val
        if isinstance(date_val, str):
            try:
                return datetime.fromisoformat(date_val.replace('Z', '+00:00'))
            except ValueError:
                pass
            try:
                return datetime.strptime(date_val, "%Y-%m-%d")
            except ValueError:
                pass
        return None

    def _safe_float(self, val: Any, default: float = 0.0) -> float:
        """Silent self-healing for floats, prohibiting negative values."""
        if val is None:
            return default
        try:
            f_val = float(val)
            return max(0.0, f_val)
        except (ValueError, TypeError):
            return default

    def check_anomalies(self, records: Any, snapshot_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Main operation. Zero configuration fault tolerance.
        If it breaks, we just return empty anomalies. No popups.
        """
        if not isinstance(records, list):
            # Graceful self-healing for totally invalid input
            records = []

        anomalies = []
        grouped_records = defaultdict(list)

        for i, record in enumerate(records):
            if not isinstance(record, dict):
                continue

            record_id = record.get('id', f'idx_{i}')
            project_id = str(record.get('project_id', 'UNKNOWN_PROJECT'))
            job_type = str(record.get('job_type', 'UNKNOWN_JOB'))

            hourly_rate = self._safe_float(record.get('hourly_rate', 0.0))

            settlement_date = self._parse_date(record.get('settlement_date'))
            policy_start = self._parse_date(record.get('policy_start_date'))
            policy_end = self._parse_date(record.get('policy_end_date'))

            # 1. Policy Validity Bounds Check
            if settlement_date:
                out_of_bounds = False
                if policy_start and settlement_date < policy_start:
                    out_of_bounds = True
                if policy_end and settlement_date > policy_end:
                    out_of_bounds = True

                if out_of_bounds:
                    anomalies.append({
                        "record_id": record_id,
                        "type": "POLICY_OUT_OF_BOUNDS",
                        "details": f"Settlement date out of bounds",
                        "settlement_date": settlement_date.isoformat(),
                        "policy_start": policy_start.isoformat() if policy_start else None,
                        "policy_end": policy_end.isoformat() if policy_end else None
                    })

            # Add for chronological jump check
            if settlement_date and hourly_rate > 0:
                grouped_records[(project_id, job_type)].append({
                    "record_id": record_id,
                    "date": settlement_date,
                    "rate": hourly_rate
                })

        # 2. Chronological Hourly Rate Jump Check
        for (proj, job), items in grouped_records.items():
            if len(items) < 2:
                continue

            items.sort(key=lambda x: x['date'])

            for idx in range(1, len(items)):
                prev_rate = items[idx-1]['rate']
                curr_rate = items[idx]['rate']

                if prev_rate > 0:
                    jump_ratio = abs(curr_rate - prev_rate) / prev_rate
                    if jump_ratio > self.jump_threshold_ratio:
                        anomalies.append({
                            "record_id": items[idx]['record_id'],
                            "type": "RATE_JUMP_ABNORMAL",
                            "details": f"Rate jump {(jump_ratio * 100):.1f}% exceeds threshold",
                            "previous_rate": prev_rate,
                            "current_rate": curr_rate
                        })

        # Generate a snapshot ID if none provided
        current_snapshot_id = snapshot_id or str(uuid.uuid4())

        # Save snapshot state
        self._snapshots[current_snapshot_id] = {
            "timestamp": time.time(),
            "original_records": records,
            "anomalies": anomalies,
            "status": "active"
        }

        return {
            "snapshot_id": current_snapshot_id,
            "anomalies": anomalies,
            "success": True
        }

    def undo(self, snapshot_id: str) -> Dict[str, Any]:
        """
        One-click undo (5 seconds). No confirmation required.
        """
        if snapshot_id not in self._snapshots:
            return {"success": False, "message": "Snapshot not found"}

        snapshot = self._snapshots[snapshot_id]

        # Check 5 second window
        time_elapsed = time.time() - snapshot["timestamp"]
        if time_elapsed > 5.0:
            return {"success": False, "message": "Undo window expired"}

        # Revert snapshot (in a real app this might revert DB changes)
        # Here we just mark it as undone to simulate the action
        snapshot["status"] = "undone"

        return {
            "success": True,
            "message": "Successfully undone",
            "reverted_records_count": len(snapshot["original_records"])
        }
