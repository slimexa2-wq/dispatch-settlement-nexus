import time
import uuid
import re
import copy
from typing import List, Dict, Any

class BankBatchTransferFormatter:
    """
    Formatter and Luhn Validator for Bank Batch Transfers with self-healing mechanisms
    and a lightweight 5-second snapshot undo mechanism.
    """

    def __init__(self):
        self._snapshots: Dict[str, Dict[str, Any]] = {}

    def _luhn_checksum(self, card_number: str) -> bool:
        """Calculate Luhn checksum to validate card number."""
        if not card_number or not card_number.isdigit():
            return False

        total = 0
        reverse_digits = card_number[::-1]
        for i, digit in enumerate(reverse_digits):
            n = int(digit)
            if i % 2 == 1:
                n *= 2
                if n > 9:
                    n -= 9
            total += n
        return total % 10 == 0

    def process(self, data: Any) -> Dict[str, Any]:
        """
        Process the batch transfer data with self-healing mechanisms.
        """
        # Self-healing: if input is completely malformed (e.g. None), default to empty list
        if not isinstance(data, list):
            data = []

        # Create a lightweight snapshot before modification
        snapshot_id = self.create_snapshot(data)

        processed = []
        for row in data:
            if not isinstance(row, dict):
                # Self-healing: skip completely invalid rows instead of crashing
                continue

            processed_row = {}

            # 1. Missing parameter default fallback for Name
            name = row.get("name")
            if name is None or not str(name).strip():
                processed_row["name"] = "未知"
            else:
                processed_row["name"] = str(name).strip()

            # 2. Dirty data healing for Account Number
            raw_acc = str(row.get("account_number", ""))
            clean_acc = re.sub(r'\D', '', raw_acc)
            processed_row["account_number"] = clean_acc
            processed_row["is_valid_account"] = self._luhn_checksum(clean_acc)

            # 3. Invalid/dirty data fallback for Amount
            raw_amt = row.get("amount")
            if raw_amt is None:
                processed_row["amount"] = 0.0
            else:
                try:
                    if isinstance(raw_amt, str):
                        raw_amt = raw_amt.replace(",", "").replace("$", "").replace("¥", "").replace(" ", "").strip()
                    processed_row["amount"] = float(raw_amt)
                except (ValueError, TypeError):
                    processed_row["amount"] = 0.0

            processed.append(processed_row)

        return {
            "snapshot_id": snapshot_id,
            "processed_data": processed
        }

    def create_snapshot(self, data: List[Any]) -> str:
        """Create a lightweight snapshot of the original data."""
        snapshot_id = str(uuid.uuid4())
        self._snapshots[snapshot_id] = {
            "timestamp": time.time(),
            "data": copy.deepcopy(data)
        }
        return snapshot_id

    def undo(self, snapshot_id: str) -> Dict[str, Any]:
        """
        Undo the processing using the snapshot ID (5-second limit).
        Returns status indicating success or failure.
        """
        snapshot = self._snapshots.get(snapshot_id)
        if not snapshot:
            return {"success": False, "data": [], "message": "Snapshot not found or invalid"}

        elapsed_time = time.time() - snapshot["timestamp"]
        if elapsed_time <= 5.0:
            return {"success": True, "data": snapshot["data"], "message": "Undo successful"}

        return {"success": False, "data": [], "message": "Snapshot expired"}
