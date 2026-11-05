"""
test_four_way_commission_auditor_integration_bridge.py
Unit tests for the FourWayCommissionAuditor
"""

import unittest
from ultra_modules.four_way_commission_auditor_integration_bridge import FourWayCommissionAuditor

class TestFourWayCommissionAuditor(unittest.TestCase):
    def setUp(self):
        self.auditor = FourWayCommissionAuditor()

    def test_normal_case(self):
        """1. 正常情况测试 (Normal case)"""
        payload = {
            "version": "2.0",
            "wage_base": 10000.0,
            "attendance_days": 15.0,
            "policy_rate": 0.1,
            "prev_commission": 500.0
        }
        # expected: 10000 * 0.1 * (15/30) + 500 = 1000 * 0.5 + 500 = 1000
        result = self.auditor.audit(payload)
        self.assertTrue(result["success"])
        self.assertEqual(result["final_commission"], 1000.0)

    def test_dirty_data_self_healing(self):
        """2. 脏数据自愈 (Dirty data self-healing)"""
        payload = {
            "version": "2.0",
            "wage_base": "10000.0",  # String instead of float
            "attendance_days": "invalid",  # Invalid string
            "policy_rate": None,  # None
            "prev_commission": " "  # Empty string
        }
        # wage_base heals to 10000.0, attendance_days heals to 0.0, policy_rate heals to 0.0, prev_commission heals to 0.0
        # current_commission = 10000.0 * 0.0 * (0/30) = 0.0
        # total = 0.0
        result = self.auditor.audit(payload)
        self.assertTrue(result["success"])
        self.assertEqual(result["final_commission"], 0.0)
        self.assertTrue(result["is_auto_healed"])

    def test_missing_parameter_fallback(self):
        """3. 缺参默认兜底 (Missing parameter fallback)"""
        payload = {
            "version": "2.0",
            # Missing all fields except version
        }
        # Should default to 0.0 for everything
        result = self.auditor.audit(payload)
        self.assertTrue(result["success"])
        self.assertEqual(result["final_commission"], 0.0)
        self.assertTrue(result["is_auto_healed"])

    def test_extreme_boundaries(self):
        """4. 极端边界值 (Extreme boundaries)"""
        payload = {
            "version": "2.0",
            "wage_base": -5000.0,  # Negative wage
            "attendance_days": 40.0,  # Over 31 days
            "policy_rate": 1.5,  # Over 100% policy rate
            "prev_commission": -100.0  # Negative prev commission is allowed by heal logic directly, wait, heal logic doesn't clamp prev_commission, let's keep it
        }
        # Expected heals:
        # wage_base = 0.0 (clamped < 0)
        # attendance_days = 31.0 (clamped > 31)
        # policy_rate = 1.0 (clamped > 1.0)
        # attendance_factor = min(31.0/30, 1.0) = 1.0
        # total_commission = 0.0 * 1.0 * 1.0 + (-100.0) = -100.0
        result = self.auditor.audit(payload)
        self.assertTrue(result["success"])
        self.assertEqual(result["final_commission"], -100.0)
        self.assertTrue(result["is_auto_healed"])

        payload2 = {
            "version": "2.0",
            "wage_base": 10000.0,
            "attendance_days": -10.0,  # Clamped to 0.0
            "policy_rate": -0.5,  # Clamped to 0.0
            "prev_commission": 0.0
        }
        result2 = self.auditor.audit(payload2)
        self.assertEqual(result2["final_commission"], 0.0)

    def test_schema_version_conversion(self):
        """5. 自动向前兼容转换器 (Schema version forward compatibility)"""
        payload = {
            "version": "1.0",
            "old_wage": 20000.0,
            "attend_d": 30.0,
            "rate": 0.05,
            "last_comm": 100.0
        }
        # Expected mapping to version 2.0 fields
        # total = 20000 * 0.05 * (30/30) + 100 = 1000 + 100 = 1100
        result = self.auditor.audit(payload)
        self.assertTrue(result["success"])
        self.assertEqual(result["final_commission"], 1100.0)
        # Ensure it works smoothly without failure

    def test_exception_fallback(self):
        """6. 模拟异常回退 (Zero configuration fault tolerance, backend silent fixes)"""
        class BadData:
            def copy(self):
                raise RuntimeError("Simulated critical crash")

        # Pass unexpected obj that crashes dict methods
        result = self.auditor.audit(BadData())
        self.assertFalse(result["success"])
        self.assertEqual(result["final_commission"], 0.0)
        self.assertTrue(result["is_auto_healed"])
        self.assertEqual(result["message"], "Audit processed with safety fallback.")

if __name__ == '__main__':
    unittest.main()
