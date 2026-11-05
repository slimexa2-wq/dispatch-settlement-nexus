import unittest
from ultra_modules.four_way_commission_auditor_batch_pipeline import (
    CommissionRecord,
    FourWayCommissionAuditor,
    FourWayCommissionBatchPipeline
)

class TestFourWayCommissionAuditorBatchPipeline(unittest.TestCase):
    def setUp(self):
        self.auditor = FourWayCommissionAuditor()
        self.pipeline = FourWayCommissionBatchPipeline(max_workers=2)

    def test_normal_data(self):
        """Test 1: Normal data calculates correctly."""
        record = CommissionRecord(
            id="rec_01",
            supplier_id="sup_01",
            employee_id="emp_01",
            salary=10000.0,
            attendance_days=22,
            policy_rate=0.1,
            last_month_commission=200.0
        )
        result = self.auditor.verify_record(record)
        self.assertTrue(result.is_valid)
        self.assertEqual(len(result.errors), 0)
        # Expected: 10000 * 0.1 = 1000. 1000 - 200 = 800
        self.assertEqual(result.calculated_commission, 800.0)

    def test_dirty_data_self_healing(self):
        """Test 2: Dirty data self-healing."""
        record = CommissionRecord(
            id="rec_02",
            supplier_id="sup_02",
            employee_id="emp_02",
            salary="5000.0",  # String instead of float
            attendance_days="10", # String instead of int
            policy_rate="invalid", # Invalid string
            last_month_commission=-100.0 # Negative not allowed, should heal to 0
        )
        result = self.auditor.verify_record(record)
        self.assertTrue(result.is_valid)
        self.assertEqual(result.salary, 5000.0)
        self.assertEqual(result.attendance_days, 10)
        self.assertEqual(result.policy_rate, 0.0)
        self.assertEqual(result.last_month_commission, 0.0)
        # Expected: 5000 * 0 = 0. Days < 15 -> 0 * 0.5 = 0.
        self.assertEqual(result.calculated_commission, 0.0)

    def test_missing_parameter_fallback(self):
        """Test 3: Missing parameter fallback."""
        raw_data = {
            "id": "rec_03",
            "supplier_id": "sup_03",
            "employee_id": "emp_03"
            # salary, attendance_days, policy_rate, last_month_commission missing
        }
        res = self.pipeline.process_batch([raw_data])
        self.assertEqual(res["total"], 1)
        self.assertEqual(res["success"], 1)
        record = res["results"][0]
        self.assertTrue(record.is_valid)
        self.assertEqual(record.salary, 0.0)
        self.assertEqual(record.attendance_days, 0)
        self.assertEqual(record.calculated_commission, 0.0)

    def test_extreme_boundaries(self):
        """Test 4: Extreme boundaries."""
        # Test case: Attendance > 31, Salary > 0 but attendance 0
        r1 = CommissionRecord(
            id="rec_04", supplier_id="sup_04", employee_id="emp_04",
            salary=1000.0, attendance_days=35, policy_rate=0.5
        )
        res1 = self.auditor.verify_record(r1)
        self.assertFalse(res1.is_valid)
        self.assertIn("Attendance days must be between 0 and 31", res1.errors)

        r2 = CommissionRecord(
            id="rec_05", supplier_id="sup_05", employee_id="emp_05",
            salary=5000.0, attendance_days=0, policy_rate=0.1
        )
        res2 = self.auditor.verify_record(r2)
        self.assertFalse(res2.is_valid)
        self.assertIn("Salary > 0 requires attendance > 0", res2.errors)

        r3 = CommissionRecord(
            id="rec_06", supplier_id="sup_06", employee_id="emp_06",
            salary=5000.0, attendance_days=20, policy_rate=1.5
        )
        res3 = self.auditor.verify_record(r3)
        self.assertFalse(res3.is_valid)
        self.assertIn("Policy rate must be between 0 and 1", res3.errors)

    def test_batch_pipeline_snapshot(self):
        """Test 5: Batch pipeline execution."""
        records = [
            {"id": f"rec_{i}", "supplier_id": "sup_01", "employee_id": f"emp_{i}", "salary": 5000, "attendance_days": 20, "policy_rate": 0.1}
            for i in range(15)
        ]
        # Add some invalid records
        records.append({"id": "", "supplier_id": "sup", "employee_id": "emp"})
        records.append({"id": "err", "supplier_id": "sup", "employee_id": "emp", "attendance_days": 40})

        result = self.pipeline.process_batch(records)
        self.assertEqual(result["total"], 17)
        self.assertEqual(result["success"], 15)
        self.assertEqual(result["failed"], 2)

        for r in result["results"]:
            if r.id.startswith("rec_"):
                self.assertTrue(r.is_valid)
                self.assertEqual(r.calculated_commission, 500.0) # 5000 * 0.1 = 500
            else:
                self.assertFalse(r.is_valid)

if __name__ == '__main__':
    unittest.main()
