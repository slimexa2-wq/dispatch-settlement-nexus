import time
from typing import Dict, Any, Optional
from decimal import Decimal, InvalidOperation

class UndoTimeoutError(Exception):
    pass

class ShiftOvertimeConverter:
    """
    电子厂工时一键折算器 (Shift Overtime Converter)
    Features:
    - Zero-configuration auto-healing of input data.
    - Precision calculation using decimal.Decimal.
    - Standard/Day/Night shift hours = 1x
    - Weekday overtime = 1.5x
    - Weekend overtime = 2.0x
    - Holiday overtime = 3.0x
    - 5-second snapshot undo mechanism.
    """
    def __init__(self):
        self._snapshots: Dict[str, Dict[str, Any]] = {}
        self._UNDO_TIMEOUT = 5.0

    def _safe_decimal(self, value: Any, default: Decimal = Decimal('0.00')) -> Decimal:
        """Silently heal dirty data, treating negatives as zero, missing/bad formats as default."""
        if value is None:
            return default
        try:
            d = Decimal(str(value))
            return d if d >= Decimal('0.00') else Decimal('0.00')
        except (InvalidOperation, TypeError, ValueError):
            return default

    def calculate(self, data: Optional[Dict[str, Any]] = None, snapshot_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculate equivalent hours based on provided data, handling all defaults and edge cases.
        Saves a snapshot for potential undo operations.
        """
        if data is None:
            data = {}

        # Self-healing parameters
        day_shift_hours = self._safe_decimal(data.get("day_shift_hours"))
        night_shift_hours = self._safe_decimal(data.get("night_shift_hours"))
        weekday_ot_hours = self._safe_decimal(data.get("weekday_overtime_hours"))
        weekend_ot_hours = self._safe_decimal(data.get("weekend_overtime_hours"))
        holiday_ot_hours = self._safe_decimal(data.get("holiday_overtime_hours"))

        # Base calculations
        base_hours = day_shift_hours + night_shift_hours
        converted_ot = (
            (weekday_ot_hours * Decimal('1.5')) +
            (weekend_ot_hours * Decimal('2.0')) +
            (holiday_ot_hours * Decimal('3.0'))
        )
        total_equivalent_hours = base_hours + converted_ot

        result = {
            "clean_day_shift_hours": float(day_shift_hours),
            "clean_night_shift_hours": float(night_shift_hours),
            "clean_weekday_ot_hours": float(weekday_ot_hours),
            "clean_weekend_ot_hours": float(weekend_ot_hours),
            "clean_holiday_ot_hours": float(holiday_ot_hours),
            "total_equivalent_hours": float(total_equivalent_hours)
        }

        # Snapshot for undo
        if snapshot_id:
            self._snapshots[snapshot_id] = {
                "timestamp": time.time(),
                "original_data": data.copy(),
                "result": result
            }

        return result

    def undo(self, snapshot_id: str) -> Dict[str, Any]:
        """
        Undo the calculation by retrieving original data if within the 5-second timeout.
        Returns the original data dictionary or raises UndoTimeoutError.
        """
        snapshot = self._snapshots.get(snapshot_id)
        if not snapshot:
            raise UndoTimeoutError("Snapshot not found.")

        elapsed = time.time() - snapshot["timestamp"]
        if elapsed > self._UNDO_TIMEOUT:
            # Clean up expired snapshot
            del self._snapshots[snapshot_id]
            raise UndoTimeoutError(f"Undo window expired (elapsed: {elapsed:.2f}s).")

        # Optionally cleanup after successful undo to prevent multiple undos
        original_data = snapshot["original_data"]
        del self._snapshots[snapshot_id]

        return original_data
