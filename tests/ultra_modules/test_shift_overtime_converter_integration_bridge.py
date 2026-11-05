import unittest
import json
from ultra_modules.shift_overtime_converter_integration_bridge import ShiftOvertimeIntegrationBridge

class TestShiftOvertimeIntegrationBridge(unittest.TestCase):

    def setUp(self):
        self.bridge = ShiftOvertimeIntegrationBridge()

    def test_normal_modern_data(self):
        """Test with modern schema explicitly defining standard fields."""
        payload = {
            "day_shift_hours": 160,
            "night_shift_hours": 20,
            "weekday_overtime_hours": 10,
            "weekend_overtime_hours": 5,
            "holiday_overtime_hours": 2,
            "base_hourly_rate": 20,
            "night_allowance_per_hour": 5
        }

        result = self.bridge.process(payload)

        # 160 + 20 = 180 base
        # 10*1.5=15 + 5*2=10 + 2*3=6 = 31 OT eq
        # total_eq = 211
        # pay = 211 * 20 + 20 * 5 = 4220 + 100 = 4320
        self.assertEqual(result["total_equivalent_hours"], 211.0)
        self.assertEqual(result["total_pay"], 4320.0)

    def test_normal_legacy_data(self):
        """Test with legacy schema using aliases."""
        payload = {
            "白班": 160,
            "n_hours": 20,
            "平时加班": 10,
            "weekendOt": 5,
            "法定加班": 2,
            "时薪": 20,
            "nightAllowance": 5
        }

        result = self.bridge.process(payload)

        self.assertEqual(result["total_equivalent_hours"], 211.0)
        self.assertEqual(result["total_pay"], 4320.0)

        logs = self.bridge.get_audit_logs()
        field_mapped_logs = [log for log in logs if log["step"] == "FIELD_MAPPED"]
        self.assertGreater(len(field_mapped_logs), 0)

    def test_dirty_data_self_healing(self):
        """Test with dirty data like strings instead of floats, and negative numbers."""
        payload = {
            "day_shift_hours": "160",
            "night_shift_hours": "20.5",
            "weekday_overtime_hours": -5, # should clamp to 0
            "weekend_overtime_hours": "not_a_number", # should fallback to 0
            "holiday_overtime_hours": 2,
            "base_hourly_rate": "20",
            "night_allowance_per_hour": "5"
        }

        result = self.bridge.process(payload)

        # 160 + 20.5 = 180.5 base
        # -5 -> 0, "not_a_number" -> 0, 2*3=6 = 6 OT eq
        # total_eq = 186.5
        # pay = 186.5 * 20 + 20.5 * 5 = 3730 + 102.5 = 3832.5
        self.assertEqual(result["total_equivalent_hours"], 186.5)
        self.assertEqual(result["total_pay"], 3832.5)

    def test_missing_parameter_defaults(self):
        """Test with missing parameters (empty payload)."""
        payload = {}

        result = self.bridge.process(payload)

        self.assertEqual(result["total_equivalent_hours"], 0.0)
        self.assertEqual(result["total_pay"], 0.0)

    def test_extreme_boundary_conditions_and_normalization(self):
        """Test with extreme boundary conditions like None payload or arbitrary string."""
        # Test None
        result = self.bridge.process(None)
        self.assertEqual(result["total_equivalent_hours"], 0.0)
        self.assertEqual(result["total_pay"], 0.0)

        # Test valid JSON string payload
        valid_json_payload = json.dumps({"day_hours": 100, "base_rate": 15})
        result2 = self.bridge.process(valid_json_payload)
        self.assertEqual(result2["total_equivalent_hours"], 100.0)
        self.assertEqual(result2["total_pay"], 1500.0)

        # Test invalid string payload
        result3 = self.bridge.process("invalid json")
        self.assertEqual(result3["total_equivalent_hours"], 0.0)

    def test_extremely_large_numbers(self):
        """Test with extremely large numbers."""
        payload = {
            "day_hours": 1e9,
            "base_rate": 1e9
        }
        result = self.bridge.process(payload)
        self.assertEqual(result["total_equivalent_hours"], 1e9)
        self.assertEqual(result["total_pay"], 1e18)

if __name__ == '__main__':
    unittest.main()
