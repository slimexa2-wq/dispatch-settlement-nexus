import unittest
from decimal import Decimal
from ultra_modules.ClientBillSummaryGenerator_integration_bridge import ClientBillSummaryGenerator

class TestClientBillSummaryGenerator(unittest.TestCase):
    def setUp(self):
        self.generator = ClientBillSummaryGenerator(management_fee_rate=0.05, tax_rate=0.06)

    def test_normal_case(self):
        """Test normal billing case with valid data."""
        data = [
            {"employee_id": "EMP001", "name": "Alice", "hours": 100, "hourly_rate": 20},
            {"employee_id": "EMP002", "name": "Bob", "hours": 50, "hourly_rate": 30}
        ]
        result = self.generator.generate(raw_data=data)

        self.assertEqual(result["status"], "success")
        summary = result["summary"]
        self.assertEqual(summary["total_employees"], 2)
        self.assertEqual(summary["total_hours"], 150.0)
        self.assertEqual(summary["base_cost"], 3500.0) # 100*20 + 50*30 = 2000 + 1500 = 3500

        # Management fee = 3500 * 0.05 = 175.0
        self.assertEqual(summary["management_fee"], 175.0)
        # Pre tax total = 3500 + 175 = 3675
        # Tax = 3675 * 0.06 = 220.5
        self.assertEqual(summary["tax_amount"], 220.5)
        # Grand total = 3675 + 220.5 = 3895.5
        self.assertEqual(summary["grand_total"], 3895.5)

        # CSV Export check
        csv_data = result["csv_export"]
        self.assertIn("EMP001", csv_data)
        self.assertIn("EMP002", csv_data)
        self.assertIn("Total Hours,150.0", csv_data)
        self.assertIn("Grand Total,3895.5", csv_data)

    def test_schema_version_compatibility(self):
        """Test silent schema mapping from old and new versions."""
        data = [
            # Old schema
            {"employee_id": "EMP001", "employee_name": "Charlie", "work_hours": 80, "base_rate": 25},
            # New schema
            {"employee_id": "EMP002", "name": "David", "hours": 120, "hourly_rate": 22}
        ]
        result = self.generator.generate(raw_data=data)

        details = result["details"]
        self.assertEqual(len(details), 2)

        charlie = next(d for d in details if d["employee_id"] == "EMP001")
        self.assertEqual(charlie["name"], "Charlie")
        self.assertEqual(charlie["hours"], 80.0)
        self.assertEqual(charlie["hourly_rate"], 25.0)

        david = next(d for d in details if d["employee_id"] == "EMP002")
        self.assertEqual(david["name"], "David")
        self.assertEqual(david["hours"], 120.0)
        self.assertEqual(david["hourly_rate"], 22.0)

        audit_logs = result["_audit_trace"]
        mapping_actions = [log["details"]["action"] for log in audit_logs if log["step"] == "SCHEMA_MAPPING"]
        self.assertIn("mapped_work_hours_to_hours", mapping_actions)
        self.assertIn("mapped_base_rate_to_hourly_rate", mapping_actions)

    def test_dirty_data_self_healing(self):
        """Test self-healing mechanisms for dirty data."""
        data = [
            {"employee_id": "EMP001", "name": "Eve", "hours": -10, "hourly_rate": 15}, # Negative hours
            {"employee_id": "EMP002", "name": "Frank", "hours": "abc", "hourly_rate": -20}, # Invalid hours, negative rate
            {"employee_id": "EMP003", "name": "Grace", "hours": "NaN", "hourly_rate": "Inf"}, # NaN and Inf
            "This is just a string, not a dictionary", # Invalid record
        ]
        result = self.generator.generate(raw_data=data)

        details = result["details"]

        eve = next(d for d in details if d["employee_id"] == "EMP001")
        self.assertEqual(eve["hours"], 0.0)
        self.assertEqual(eve["hourly_rate"], 15.0)

        frank = next(d for d in details if d["employee_id"] == "EMP002")
        self.assertEqual(frank["hours"], 0.0)
        self.assertEqual(frank["hourly_rate"], 0.0)

        grace = next(d for d in details if d["employee_id"] == "EMP003")
        self.assertEqual(grace["hours"], 0.0)
        self.assertEqual(grace["hourly_rate"], 0.0)

        # Audit logs should reflect cleaning
        audit_logs = result["_audit_trace"]
        cleaning_actions = [log["details"]["action"] for log in audit_logs if log["step"] == "DATA_CLEANING"]
        self.assertIn("fix_negative_hours", cleaning_actions)
        self.assertIn("fix_negative_rate", cleaning_actions)
        self.assertIn("drop_invalid_record_type", cleaning_actions)

    def test_missing_parameters_fallback(self):
        """Test defaults for missing config or missing data parameters."""
        # Empty list, None config
        result1 = self.generator.generate(raw_data=[], config=None)
        self.assertEqual(result1["summary"]["total_employees"], 0)
        self.assertEqual(result1["summary"]["grand_total"], 0.0)

        # Missing rates in config, missing some fields in data
        data = [{"employee_id": "EMP001"}] # No name, hours, hourly_rate
        result2 = self.generator.generate(
            raw_data=data,
            config={"management_fee_rate": -0.1, "tax_rate": -0.1}
        )

        # Test string inputs with symbols to cover line 38
        result4 = self.generator.generate(
            raw_data=[{"employee_id": "EMP005", "hours": "￥ ", "hourly_rate": "¥ ,"}],
            config=None
        )
        self.assertEqual(result4["summary"]["total_hours"], 0.0)

        details = result2["details"][0]
        self.assertEqual(details["name"], "Employee EMP001")
        self.assertEqual(details["hours"], 0.0)
        self.assertEqual(details["hourly_rate"], 0.0)

        # Valid config override
        result3 = self.generator.generate(
            raw_data=[{"employee_id": "EMP001", "hours": 100, "hourly_rate": 10}],
            config={"management_fee_rate": 0.1, "tax_rate": 0.1}
        )
        summary = result3["summary"]
        self.assertEqual(summary["base_cost"], 1000.0)
        self.assertEqual(summary["management_fee"], 100.0) # 1000 * 0.1
        self.assertEqual(summary["tax_amount"], 110.0) # (1000 + 100) * 0.1
        self.assertEqual(summary["grand_total"], 1210.0)

    def test_extreme_boundary_cases(self):
        """Test extreme bounds and deduplication behavior."""
        data = [
            # High rate and high hours
            {"employee_id": "EMP001", "hours": 999999, "hourly_rate": 999999},
            # Zero hours, zero rate
            {"employee_id": "EMP002", "hours": 0, "hourly_rate": 0},
            # Deduplication tests: Same employee multiple times
            {"employee_id": "EMP003", "hours": 10, "hourly_rate": 50},
            {"employee_id": "EMP003", "hours": 20, "hourly_rate": 60},
            {"employee_id": "EMP003", "hours": 30, "hourly_rate": 40},
            # Missing Employee ID, will auto-assign
            {"hours": 50, "hourly_rate": 100}
        ]
        result = self.generator.generate(raw_data=data)

        details = result["details"]

        emp1 = next(d for d in details if d["employee_id"] == "EMP001")
        self.assertEqual(emp1["subtotal"], 999998000001.0)

        emp2 = next(d for d in details if d["employee_id"] == "EMP002")
        self.assertEqual(emp2["subtotal"], 0.0)

        emp3 = next(d for d in details if d["employee_id"] == "EMP003")
        # Hours should be aggregated: 10 + 20 + 30 = 60
        # Rate should be max: 60
        self.assertEqual(emp3["hours"], 60.0)
        self.assertEqual(emp3["hourly_rate"], 60.0)
        self.assertEqual(emp3["subtotal"], 3600.0)

        # Check for auto-assigned ID
        auto_assigned = [d for d in details if d["employee_id"].startswith("UNKNOWN_")]
        self.assertEqual(len(auto_assigned), 1)
        self.assertEqual(auto_assigned[0]["subtotal"], 5000.0)

if __name__ == '__main__':
    unittest.main()
