import unittest
from ultra_modules.ClientBillSummaryGenerator_audit_trace import ClientBillSummaryGenerator

class TestClientBillSummaryGenerator(unittest.TestCase):

    def setUp(self):
        self.generator = ClientBillSummaryGenerator(management_fee_rate=0.05, tax_rate=0.06)

    def test_01_normal_execution(self):
        """Test with clean, normal data."""
        raw_data = [
            {"employee_id": "EMP001", "name": "Alice", "hours": 160, "hourly_rate": 50},
            {"employee_id": "EMP002", "name": "Bob", "hours": 80, "hourly_rate": 60}
        ]
        config = {"management_fee_rate": 0.1, "tax_rate": 0.05}

        result = self.generator.generate(raw_data, config)

        self.assertEqual(result["status"], "success")
        summary = result["summary"]
        self.assertEqual(summary["total_employees"], 2)
        self.assertEqual(summary["total_hours"], 240)

        # EMP001: 160*50 = 8000
        # EMP002: 80*60 = 4800
        # base_cost = 12800
        self.assertEqual(summary["base_cost"], 12800)
        # management_fee = 12800 * 0.1 = 1280
        self.assertEqual(summary["management_fee"], 1280)
        # pre_tax = 12800 + 1280 = 14080
        # tax = 14080 * 0.05 = 704
        self.assertEqual(summary["tax_amount"], 704)
        # grand_total = 14080 + 704 = 14784
        self.assertEqual(summary["grand_total"], 14784)

        # Ensure audit trace is captured
        self.assertTrue(len(result["_audit_trace"]) > 0)

    def test_02_dirty_data_self_healing(self):
        """Test dirty data like invalid types, negative hours/rates."""
        raw_data = [
            {"employee_id": "EMP003", "name": "Charlie", "hours": -10, "hourly_rate": 50}, # Negative hours -> 0
            {"employee_id": "EMP004", "hours": "not_a_number", "hourly_rate": -5}, # Invalid hours -> 0, Negative rate -> 0
            "invalid_record_string", # Should be ignored
            {"name": "NoID", "hours": 100, "hourly_rate": 20} # Missing ID -> auto assigned
        ]

        result = self.generator.generate(raw_data)
        summary = result["summary"]

        self.assertEqual(summary["total_employees"], 3)
        self.assertEqual(summary["total_hours"], 100) # Only NoID has valid positive hours (100)
        self.assertEqual(summary["base_cost"], 2000) # 100 * 20

        # Check audit trace for specific healing events
        trace_actions = [log.get("details", {}).get("action") for log in result["_audit_trace"] if log.get("step") == "DATA_CLEANING"]
        self.assertIn("fix_negative_hours", trace_actions)
        self.assertIn("fix_invalid_hours", trace_actions)
        self.assertIn("drop_invalid_record_type", trace_actions)
        self.assertIn("auto_assign_emp_id", trace_actions)

    def test_03_missing_parameters_fallback(self):
        """Test fallback for missing or None configuration parameters and raw_data."""
        # Empty raw_data, None config
        result = self.generator.generate(None, None)

        summary = result["summary"]
        self.assertEqual(summary["total_employees"], 0)
        self.assertEqual(summary["grand_total"], 0)

        # Check that default rates were applied via audit log
        fallback_logs = [log for log in result["_audit_trace"] if log.get("step") == "FALLBACK_CONFIG"]
        self.assertEqual(len(fallback_logs), 2)
        params_fixed = [log["details"]["param"] for log in fallback_logs]
        self.assertIn("management_fee_rate", params_fixed)
        self.assertIn("tax_rate", params_fixed)

        # Test with invalid config types
        result_invalid_config = self.generator.generate([], {"management_fee_rate": "invalid", "tax_rate": -1})
        fallback_logs = [log for log in result_invalid_config["_audit_trace"] if log.get("step") == "FALLBACK_CONFIG"]
        self.assertEqual(len(fallback_logs), 2)

    def test_04_extreme_boundaries(self):
        """Test with massive amounts of hours or zero rates."""
        raw_data = [
            {"employee_id": "EMP_MAX", "name": "Max", "hours": 999999999.99, "hourly_rate": 9999.99},
            {"employee_id": "EMP_ZERO", "name": "Zero", "hours": 0, "hourly_rate": 0},
            {"employee_id": "EMP_MICRO", "name": "Micro", "hours": 0.0001, "hourly_rate": 0.0001}
        ]

        result = self.generator.generate(raw_data, {"management_fee_rate": 0.0, "tax_rate": 0.0})
        summary = result["summary"]

        self.assertEqual(summary["total_employees"], 3)
        self.assertAlmostEqual(summary["base_cost"], 999999999.99 * 9999.99, delta=0.01)
        self.assertEqual(summary["management_fee"], 0)
        self.assertEqual(summary["tax_amount"], 0)
        self.assertEqual(summary["grand_total"], summary["base_cost"])

    def test_05_duplicate_inputs_deduplication(self):
        """Test that multiple entries for the same employee are aggregated correctly."""
        raw_data = [
            {"employee_id": "EMP_DUP", "name": "Dup", "hours": 40, "hourly_rate": 50},
            {"employee_id": "EMP_DUP", "name": "Dup", "hours": 30, "hourly_rate": 55}, # Higher rate should take precedence
            {"employee_id": "EMP_DUP", "name": "Dup", "hours": 10.5, "hourly_rate": 40}
        ]

        result = self.generator.generate(raw_data, {"management_fee_rate": 0, "tax_rate": 0})
        summary = result["summary"]
        details = result["details"]

        self.assertEqual(summary["total_employees"], 1)
        self.assertEqual(summary["total_hours"], 80.5)
        # Should use highest hourly rate: 55
        self.assertEqual(details[0]["hourly_rate"], 55)
        self.assertEqual(summary["base_cost"], 80.5 * 55)

        # Check audit trace for deduplication
        dedup_logs = [log for log in result["_audit_trace"] if log.get("step") == "DEDUPLICATION"]
        self.assertTrue(len(dedup_logs) > 0)
        actions = [log["details"]["action"] for log in dedup_logs]
        self.assertIn("merge_duplicate_emp", actions)
        self.assertIn("update_rate_to_max", actions)

if __name__ == '__main__':
    unittest.main()
