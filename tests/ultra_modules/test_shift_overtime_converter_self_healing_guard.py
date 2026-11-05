import unittest
import time
from ultra_modules.shift_overtime_converter_self_healing_guard import ShiftOvertimeConverter, UndoTimeoutError

class TestShiftOvertimeConverter(unittest.TestCase):
    def setUp(self):
        self.converter = ShiftOvertimeConverter()

    def test_normal_calculation(self):
        """Test with valid and clean data."""
        data = {
            "day_shift_hours": 8,
            "night_shift_hours": 0,
            "weekday_overtime_hours": 2,
            "weekend_overtime_hours": 4,
            "holiday_overtime_hours": 8
        }
        # 8 + 0 + (2 * 1.5) + (4 * 2) + (8 * 3) = 8 + 3 + 8 + 24 = 43
        result = self.converter.calculate(data)
        self.assertEqual(result["total_equivalent_hours"], 43.0)
        self.assertEqual(result["clean_day_shift_hours"], 8.0)
        self.assertEqual(result["clean_weekday_ot_hours"], 2.0)

    def test_dirty_data_self_healing(self):
        """Test with invalid strings, types, and negative values to ensure they heal to 0.0."""
        data = {
            "day_shift_hours": "eight", # Invalid string -> 0
            "night_shift_hours": -5,    # Negative -> 0
            "weekday_overtime_hours": None, # None -> 0
            "weekend_overtime_hours": "10.5", # Valid string -> 10.5
            "holiday_overtime_hours": [1, 2] # Invalid type -> 0
        }
        # 0 + 0 + 0 + (10.5 * 2) + 0 = 21
        result = self.converter.calculate(data)
        self.assertEqual(result["total_equivalent_hours"], 21.0)
        self.assertEqual(result["clean_day_shift_hours"], 0.0)
        self.assertEqual(result["clean_night_shift_hours"], 0.0)
        self.assertEqual(result["clean_weekday_ot_hours"], 0.0)
        self.assertEqual(result["clean_weekend_ot_hours"], 10.5)

    def test_missing_parameters_default(self):
        """Test with missing parameters or entirely None input."""
        # Empty dict
        result1 = self.converter.calculate({})
        self.assertEqual(result1["total_equivalent_hours"], 0.0)

        # None input
        result2 = self.converter.calculate(None)
        self.assertEqual(result2["total_equivalent_hours"], 0.0)

        # Partial missing
        result3 = self.converter.calculate({"day_shift_hours": 8})
        self.assertEqual(result3["total_equivalent_hours"], 8.0)
        self.assertEqual(result3["clean_night_shift_hours"], 0.0)

    def test_extreme_boundaries(self):
        """Test with extremely large values and precision handling."""
        data = {
            "day_shift_hours": 999999999.99,
            "holiday_overtime_hours": "1000000.01"
        }
        # 999999999.99 + (1000000.01 * 3) = 999999999.99 + 3000000.03 = 1003000000.02
        result = self.converter.calculate(data)
        self.assertEqual(result["total_equivalent_hours"], 1003000000.02)
        self.assertEqual(result["clean_day_shift_hours"], 999999999.99)
        self.assertEqual(result["clean_holiday_ot_hours"], 1000000.01)

    def test_undo_mechanism(self):
        """Test the 5-second snapshot undo mechanism."""
        data = {"day_shift_hours": 8, "weekday_overtime_hours": 2}
        snapshot_id = "test-snap-1"

        # Perform calculation and create snapshot
        self.converter.calculate(data, snapshot_id=snapshot_id)

        # Immediate undo should succeed
        original_data = self.converter.undo(snapshot_id)
        self.assertEqual(original_data, data)

        # Snapshot should be removed after undo
        with self.assertRaises(UndoTimeoutError):
            self.converter.undo(snapshot_id)

    def test_undo_timeout(self):
        """Test that undo fails after the 5-second timeout."""
        data = {"day_shift_hours": 8}
        snapshot_id = "test-snap-2"

        # Perform calculation
        self.converter.calculate(data, snapshot_id=snapshot_id)

        # Simulate time passing beyond timeout
        self.converter._snapshots[snapshot_id]["timestamp"] -= 6.0

        with self.assertRaises(UndoTimeoutError):
            self.converter.undo(snapshot_id)

if __name__ == '__main__':
    unittest.main()
