import time
import math
import uuid
from typing import Dict, List, Any, Optional, Tuple

class Snapshot:
    def __init__(self, data: Dict[str, Any], ttl_seconds: int = 5):
        self.snapshot_id = str(uuid.uuid4())
        self.data = data
        self.created_at = time.time()
        self.ttl_seconds = ttl_seconds

    def is_expired(self) -> bool:
        return time.time() - self.created_at > self.ttl_seconds

class SnapshotManager:
    def __init__(self):
        self.snapshots: Dict[str, Snapshot] = {}

    def save(self, data: Dict[str, Any], ttl_seconds: int = 5) -> str:
        snapshot = Snapshot(data=data.copy(), ttl_seconds=ttl_seconds)
        self.snapshots[snapshot.snapshot_id] = snapshot
        return snapshot.snapshot_id

    def restore(self, snapshot_id: str) -> Optional[Dict[str, Any]]:
        snapshot = self.snapshots.get(snapshot_id)
        if not snapshot:
            return None
        if snapshot.is_expired():
            # Automatically clean up expired snapshot on access attempt
            del self.snapshots[snapshot_id]
            return None

        data = snapshot.data
        del self.snapshots[snapshot_id]
        return data

class FuzzyHeaderGuard:
    """
    Zero-config semantic fuzzy fingerprint guard for non-standard attendance/salary table headers.
    Features:
    - Silent auto-healing of dirty inputs (spaces, newlines, invalid types).
    - Default fallback values for missing parameters.
    - 5-second one-click Undo (Snapshot) mechanism.
    - No interruptive pop-up errors.
    """

    def __init__(self):
        self.snapshot_manager = SnapshotManager()
        # Predefined semantic fingerprints for target headers
        self.target_fingerprints = {
            "net_salary": self._get_char_freq("实发工资"),
            "gross_salary": self._get_char_freq("应发工资"),
            "attendance_days": self._get_char_freq("打卡天数"),
            "employee_id": self._get_char_freq("工号")
        }

    def _clean_string(self, text: Any) -> str:
        """Silent auto-healing: convert to string, remove whitespaces/newlines"""
        if text is None:
            return ""
        if not isinstance(text, str):
            text = str(text)
        return "".join(text.split())

    def _get_char_freq(self, text: str) -> Dict[str, int]:
        freq = {}
        for char in text:
            freq[char] = freq.get(char, 0) + 1
        return freq

    def _cosine_similarity(self, vec1: Dict[str, int], vec2: Dict[str, int]) -> float:
        intersection = set(vec1.keys()) & set(vec2.keys())
        numerator = sum([vec1[x] * vec2[x] for x in intersection])

        sum1 = sum([vec1[x]**2 for x in vec1.keys()])
        sum2 = sum([vec2[x]**2 for x in vec2.keys()])
        denominator = math.sqrt(sum1) * math.sqrt(sum2)

        if not denominator:
            return 0.0
        return float(numerator) / denominator

    def match_headers(self, input_headers: List[Any], threshold: float = 0.5) -> Tuple[Dict[str, str], str]:
        """
        Takes a list of raw dirty headers.
        Returns a mapping of canonical key to the matched input header, and a snapshot_id for undoing.
        Missing params fallback to empty list.
        """
        if not isinstance(input_headers, list):
            input_headers = []

        mapping = {}

        for raw_header in input_headers:
            clean_header = self._clean_string(raw_header)
            if not clean_header:
                continue

            input_freq = self._get_char_freq(clean_header)

            best_match = None
            best_score = -1.0

            for key, target_freq in self.target_fingerprints.items():
                score = self._cosine_similarity(input_freq, target_freq)
                if score > best_score and score >= threshold:
                    best_score = score
                    best_match = key

            if best_match:
                # If multiple headers map to the same key, we keep the first one or highest score?
                # Let's just keep the last best match to avoid error popups, or first match.
                # Keeping it simple: assign it.
                if best_match not in mapping:
                    mapping[best_match] = raw_header

        # Save snapshot of the input data for undo
        snapshot_id = self.snapshot_manager.save({"original_input": input_headers.copy() if isinstance(input_headers, list) else []})

        return mapping, snapshot_id

    def undo(self, snapshot_id: str) -> Optional[Dict[str, Any]]:
        """
        One-click undo using the snapshot ID.
        Returns the original state, or None if expired or invalid.
        """
        return self.snapshot_manager.restore(snapshot_id)
