import unittest
import time
from ultra_modules.four_way_commission_auditor_self_healing_guard import FourWayCommissionAuditor

class TestFourWayCommissionAuditor(unittest.TestCase):
    def setUp(self):
        self.auditor = FourWayCommissionAuditor()

    def test_normal_case(self):
        """测试正常数据计算逻辑"""
        record = {
            'salary': 10000.0,
            'attendance_days': 21.75,
            'policy_rate': 0.1,
            'last_month_commission': 500.0
        }
        res = self.auditor.audit(record)
        healed = res['result']

        self.assertEqual(healed['salary'], 10000.0)
        self.assertEqual(healed['attendance_days'], 21.75)
        self.assertEqual(healed['policy_rate'], 0.1)
        self.assertEqual(healed['last_month_commission'], 500.0)
        # Base = 10000 * 0.1 = 1000
        # Attendance = 21.75 / 21.75 = 1.0 -> 1000 * 1 = 1000
        # Final = 1000 + 500 = 1500
        self.assertEqual(healed['final_commission'], 1500.0)
        self.assertEqual(healed['status'], 'AUDITED')

    def test_dirty_data_self_healing(self):
        """测试脏数据自愈逻辑，静默修复格式瑕疵"""
        record = {
            'salary': "￥10,000.50", # String with symbols
            'attendance_days': "21.75天", # String with text
            'policy_rate': "10%", # This extracts 10, then min(1.0, 10) = 1.0 (dirty input mapped safely)
            'last_month_commission': None # None value
        }
        res = self.auditor.audit(record)
        healed = res['result']

        self.assertEqual(healed['salary'], 10000.50)
        self.assertEqual(healed['attendance_days'], 21.75)
        self.assertEqual(healed['policy_rate'], 1.0) # clamped 10 -> 1.0
        self.assertEqual(healed['last_month_commission'], 0.0) # None -> 0.0

        # Base = 10000.50 * 1.0 = 10000.50
        # Final = 10000.50 + 0 = 10000.50
        self.assertEqual(healed['final_commission'], 10000.50)

    def test_missing_parameter_defaults(self):
        """测试缺参自动设合理默认值兜底"""
        record = {} # Empty dict
        res = self.auditor.audit(record)
        healed = res['result']

        self.assertEqual(healed['salary'], 0.0)
        self.assertEqual(healed['attendance_days'], 21.75)
        self.assertEqual(healed['policy_rate'], 0.1)
        self.assertEqual(healed['last_month_commission'], 0.0)

        self.assertEqual(healed['final_commission'], 0.0)

    def test_extreme_boundaries(self):
        """测试极端边界及封顶规则"""
        record = {
            'salary': -5000, # Negative salary -> 0
            'attendance_days': 40, # > 31 -> 31, ratio = 1.0
            'policy_rate': 2.5, # > 1.0 -> 1.0
            'last_month_commission': -100 # Negative -> 0
        }
        res = self.auditor.audit(record)
        healed = res['result']

        self.assertEqual(healed['salary'], 0.0)
        self.assertEqual(healed['attendance_days'], 31.0)
        self.assertEqual(healed['policy_rate'], 1.0)
        self.assertEqual(healed['last_month_commission'], 0.0)
        self.assertEqual(healed['final_commission'], 0.0)

        # Test cap (Rule 9)
        record2 = {
            'salary': 1000.0,
            'attendance_days': 21.75,
            'policy_rate': 1.0, # base = 1000
            'last_month_commission': 10000.0 # total = 11000, cap at 500% * 1000 = 5000
        }
        res2 = self.auditor.audit(record2)
        self.assertEqual(res2['result']['final_commission'], 5000.0)

    def test_snapshot_undo(self):
        """测试5秒一键撤回(Undo)快照机制"""
        record = {'salary': 8000}
        res = self.auditor.audit(record)
        snapshot_id = res['snapshot_id']

        # Valid undo within 5s
        undo_res = self.auditor.undo(snapshot_id)
        self.assertTrue(undo_res['success'])
        self.assertEqual(undo_res['data'], record)

        # Invalid snapshot ID
        self.assertFalse(self.auditor.undo("invalid_id")['success'])

        # Simulating time limit exceed
        self.auditor.snapshots[snapshot_id]['timestamp'] -= 6.0

        # Should fail as it exceeds 5 seconds, but another undo attempt will succeed since it was already undone
        # Let's test a fresh one
        res2 = self.auditor.audit(record)
        snapshot_id2 = res2['snapshot_id']
        self.auditor.snapshots[snapshot_id2]['timestamp'] -= 6.0

        undo_res2 = self.auditor.undo(snapshot_id2)
        self.assertFalse(undo_res2['success'])
        self.assertIsNone(undo_res2['data'])

if __name__ == '__main__':
    unittest.main()
