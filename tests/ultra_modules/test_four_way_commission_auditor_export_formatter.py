import unittest
import math
from ultra_modules.four_way_commission_auditor_export_formatter import audit_and_format_commissions

class TestFourWayCommissionAuditor(unittest.TestCase):
    def test_normal_functionality(self):
        raw_data = [{
            "supplier_id": "SUP_01",
            "base_salary": 3000,
            "attendance_days": 30,
            "policy_type": "PREMIUM",
            "last_month_commission": 500,
            "performance_multiplier": 1.2,
            "deductions": 100
        }]
        audit_log = []
        csv_out, report, trace_id = audit_and_format_commissions(raw_data, audit_log)

        # Base: 3000 * 30/30 = 3000
        # raw commission: 3000 * 1.2 + 500 - 100 = 4000
        self.assertIn("SUP_01", csv_out)
        self.assertIn("4000.00", csv_out)
        self.assertIn("PREMIUM", csv_out)
        self.assertIn("自动修复脏数据 0 处", report)
        self.assertTrue(len(audit_log) > 0)
        self.assertIsNotNone(trace_id)

    def test_dirty_data_self_healing(self):
        raw_data = [{
            "supplier_id": "SUP_02",
            "base_salary": "invalid",
            "attendance_days": -5,
            "policy_type": None,
            "last_month_commission": math.nan,
            "performance_multiplier": 3.0, # invalid > 2.0
            "deductions": -100
        }]
        csv_out, report, trace_id = audit_and_format_commissions(raw_data)

        # Base: 0
        # Attendance: 0 (from negative)
        # Policy: STANDARD (from None)
        # Last month: 0 (from NaN)
        # Multiplier: 1.0 (fixed from 3.0) -> anomalies + 1
        # Deductions: 0 (from negative)
        # Final commission: 0.00
        self.assertIn("SUP_02", csv_out)
        self.assertIn("0.00", csv_out)
        self.assertIn("STANDARD", csv_out)
        self.assertIn("自动修复脏数据 1 处", report) # performance_multiplier fix

    def test_missing_parameter_fallback(self):
        raw_data = [{}] # completely empty dict
        csv_out, report, trace_id = audit_and_format_commissions(raw_data)

        self.assertIn("UNKNOWN_0", csv_out)
        self.assertIn("STANDARD", csv_out)
        self.assertIn("0.00", csv_out)
        self.assertIn("自动修复脏数据 0 处", report)

    def test_empty_input_list_and_empty_policy(self):
        raw_data = [{"policy_type": "   "}]
        csv_out, report, trace_id = audit_and_format_commissions(raw_data)
        self.assertIn("STANDARD", csv_out)

        csv_out2, report2, trace_id2 = audit_and_format_commissions([])
        self.assertIn("supplier_id,base_salary,attendance_days,policy_type,last_month_commission,performance_multiplier,deductions,final_commission\n", csv_out2)

        self.assertIn("UNKNOWN_0", csv_out)
        self.assertIn("STANDARD", csv_out)
        self.assertIn("0.00", csv_out)
        self.assertIn("自动修复脏数据 0 处", report)

    def test_extreme_edge_cases(self):
        raw_data = [
            None, # not a dict
            {
                "supplier_id": "SUP_04",
                "base_salary": 1e9,
                "attendance_days": 100, # > 30, should cap at base salary logic
                "performance_multiplier": 2.0,
                "deductions": 2e9 # > base_salary, should cap at base salary
            }
        ]
        csv_out, report, trace_id = audit_and_format_commissions(raw_data)

        self.assertIn("UNKNOWN_0", csv_out)
        self.assertIn("SUP_04", csv_out)
        # supplier 4: base=1e9, att=100 -> calculated base = 1e9
        # multiplier = 2.0
        # deductions = cap at 1e9 -> anomalies + 1
        # final = (1e9 * 2.0) + 0 - 1e9 = 1e9
        self.assertIn("1000000000.00", csv_out)
        self.assertIn("自动修复脏数据 1 处", report)

    def test_commission_mismatches_and_caps(self):
        raw_data = [{
            "supplier_id": "SUP_05",
            "base_salary": 1000,
            "attendance_days": 15,
            "last_month_commission": -200, # invalid, should be 0
            "performance_multiplier": 1.0,
            "deductions": 1500 # > 1000, cap to 1000 -> anomalies + 1
        }]
        csv_out, report, trace_id = audit_and_format_commissions(raw_data)

        # Base: 1000, Att: 15 -> calculated base = 500
        # Last month: 0
        # Multiplier: 1.0
        # Deductions: capped at 1000
        # Raw commission: (500 * 1.0) + 0 - 1000 = -500 -> capped at 0.0
        self.assertIn("SUP_05", csv_out)
        self.assertIn("1000.00", csv_out) # max deduction
        self.assertIn("0.00", csv_out) # final commission
        self.assertIn("自动修复脏数据 1 处", report)

if __name__ == '__main__':
    unittest.main()
