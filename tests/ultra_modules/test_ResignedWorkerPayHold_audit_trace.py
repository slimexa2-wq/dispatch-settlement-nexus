import unittest
import math
from ultra_modules.ResignedWorkerPayHold_audit_trace import reconcile_pay_hold, _clean_float

class TestResignedWorkerPayHoldAuditTrace(unittest.TestCase):

    def test_clean_float(self):
        self.assertEqual(_clean_float(None, 10.0), 10.0)
        self.assertEqual(_clean_float(math.nan, 5.0), 5.0)
        self.assertEqual(_clean_float(math.inf, 5.0), 5.0)
        self.assertEqual(_clean_float(-100.0, 5.0), 0.0)
        self.assertEqual(_clean_float("abc", 5.0), 5.0)
        self.assertEqual(_clean_float([], 5.0), 5.0)
        self.assertEqual(_clean_float(25.5, 0.0), 25.5)

    def test_normal_limit_deduction(self):
        # Normal deduction within 20% limit
        res = reconcile_pay_hold(
            worker_id="W123",
            unissued_salary=1000.0,
            requested_deduction=150.0,
            max_deduction_ratio=0.2
        )
        self.assertEqual(res["worker_id"], "W123")
        self.assertEqual(res["original_unissued_salary"], 1000.0)
        self.assertEqual(res["requested_deduction"], 150.0)
        self.assertEqual(res["allowed_deduction"], 150.0)
        self.assertEqual(res["final_pay"], 850.0)
        self.assertFalse(res["is_capped"])
        self.assertEqual(res["diff_highlight"]["requested_vs_allowed_diff"], 0.0)
        self.assertIsNone(res["diff_highlight"]["cap_reason"])
        self.assertTrue(any("Reconciliation successful" in trace for trace in res["audit_trace"]))

    def test_emergency_limit_exceeded(self):
        # Deduction exceeding limit
        res = reconcile_pay_hold({
            "worker_id": "W999",
            "unissued_salary": 2000.0,
            "requested_deduction": 800.0,
            "max_deduction_ratio": 0.2
        })
        self.assertEqual(res["allowed_deduction"], 400.0) # 2000 * 0.2 = 400
        self.assertEqual(res["final_pay"], 1600.0)
        self.assertTrue(res["is_capped"])
        self.assertEqual(res["diff_highlight"]["requested_vs_allowed_diff"], 400.0)
        self.assertEqual(res["diff_highlight"]["cap_reason"], "Exceeded statutory compliance limit")

    def test_missing_and_dirty_inputs(self):
        # Empty input dict should fallback to defaults
        res = reconcile_pay_hold({})
        self.assertEqual(res["worker_id"], "UNKNOWN_WORKER")
        self.assertEqual(res["original_unissued_salary"], 0.0)
        self.assertEqual(res["requested_deduction"], 0.0)
        self.assertEqual(res["allowed_deduction"], 0.0)
        self.assertEqual(res["final_pay"], 0.0)
        self.assertFalse(res["is_capped"])

        res2 = reconcile_pay_hold(
            worker_id=None,
            unissued_salary="invalid",
            requested_deduction=-500.0,
            max_deduction_ratio=math.nan
        )
        self.assertEqual(res2["worker_id"], "UNKNOWN_WORKER")
        self.assertEqual(res2["original_unissued_salary"], 0.0)
        self.assertEqual(res2["requested_deduction"], 0.0)
        self.assertEqual(res2["allowed_deduction"], 0.0)
        self.assertEqual(res2["final_pay"], 0.0)

    def test_negative_constraints_and_high_ratio(self):
        # Requested deduction more than salary with a very high ratio
        res = reconcile_pay_hold(
            unissued_salary=100.0,
            requested_deduction=200.0,
            max_deduction_ratio=1.5 # Should be capped at 1.0
        )
        self.assertEqual(res["allowed_deduction"], 100.0)
        self.assertEqual(res["final_pay"], 0.0)
        self.assertTrue(res["is_capped"])
        self.assertEqual(res["diff_highlight"]["requested_vs_allowed_diff"], 100.0)
        self.assertEqual(res["diff_highlight"]["cap_reason"], "Exceeded available unissued salary")

    def test_none_data(self):
        # Passing None for data
        res = reconcile_pay_hold(None)
        self.assertEqual(res["worker_id"], "UNKNOWN_WORKER")
        self.assertEqual(res["original_unissued_salary"], 0.0)
        self.assertEqual(res["requested_deduction"], 0.0)
        self.assertEqual(res["allowed_deduction"], 0.0)

    def test_extreme_boundaries(self):
        # Salary is zero
        res = reconcile_pay_hold(unissued_salary=0.0, requested_deduction=100.0, max_deduction_ratio=0.2)
        self.assertEqual(res["allowed_deduction"], 0.0)
        self.assertTrue(res["is_capped"])

        # Deduction is zero
        res2 = reconcile_pay_hold(unissued_salary=1000.0, requested_deduction=0.0, max_deduction_ratio=0.5)
        self.assertEqual(res2["allowed_deduction"], 0.0)
        self.assertEqual(res2["final_pay"], 1000.0)
        self.assertFalse(res2["is_capped"])

if __name__ == '__main__':
    unittest.main()
