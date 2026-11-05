import unittest
import time
from ultra_modules.social_security_prorater_self_healing_guard import SocialSecurityProrater

class TestSocialSecurityProraterSelfHealingGuard(unittest.TestCase):
    def setUp(self):
        self.prorater = SocialSecurityProrater()

    def test_normal_execution(self):
        """Test standard correct inputs."""
        data = {
            "base": 10000.0,
            "rate": 0.1,  # 10%
            "days_worked": 15,
            "total_days": 30
        }
        res = self.prorater.calculate("req-1", data)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["prorated_amount"], 500.0)

    def test_dirty_data_healing_and_missing_params(self):
        """Test silent data healing for missing parameters and dirty values."""
        data = {
            "base": "invalid_string", # Should be ignored and healed to 0
            # missing "rate"
            "days_worked": -5,        # Should be healed to 0
            "total_days": 0           # Should be healed to standard 30
        }
        res = self.prorater.calculate("req-2", data)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["healed"]["base"], 0.0)
        self.assertEqual(res["healed"]["rate"], 0.0)
        self.assertEqual(res["healed"]["days_worked"], 0)
        self.assertEqual(res["healed"]["total_days"], 30)
        self.assertEqual(res["prorated_amount"], 0.0)

    def test_extreme_boundary_conditions(self):
        """Test extreme boundary where days worked exceeds total days."""
        data = {
            "base": 5000.0,
            "rate": 0.2,
            "days_worked": 40,  # Exceeds total days
            "total_days": 30
        }
        res = self.prorater.calculate("req-3", data)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["healed"]["days_worked"], 30) # Capped at total_days
        self.assertEqual(res["prorated_amount"], 1000.0) # (5000 * 0.2) * (30/30)

    def test_snapshot_undo_success(self):
        """Test that data can be undone within 5 seconds."""
        data = {"base": 8000.0, "rate": 0.1, "days_worked": 10, "total_days": 30}
        self.prorater.calculate("req-4", data)

        # Undo immediately
        undone_data = self.prorater.undo("req-4")
        self.assertEqual(undone_data, data)

        # Subsequent undo should be None
        self.assertIsNone(self.prorater.undo("req-4"))

    def test_snapshot_undo_expiration(self):
        """Test that snapshots expire after 5 seconds (simulated)."""
        data = {"base": 8000.0, "rate": 0.1, "days_worked": 10, "total_days": 30}
        self.prorater.calculate("req-5", data)

        # Simulate time passage
        self.prorater.snapshots["req-5"]["timestamp"] -= 6.0

        # Undo should return None because snapshot is expired
        undone_data = self.prorater.undo("req-5")
        self.assertIsNone(undone_data)
        self.assertNotIn("req-5", self.prorater.snapshots)

    def test_silent_exception_handling(self):
        """Test silent fallback when an unexpected error happens."""
        # Using a weird mock that triggers exception on deepcopy
        class Uncopyable:
            def __deepcopy__(self, memo):
                raise ValueError("Cannot copy")

        data = {"base": Uncopyable()}
        res = self.prorater.calculate("req-6", data)
        self.assertEqual(res["status"], "error_healed")
        self.assertEqual(res["prorated_amount"], 0.0)

if __name__ == '__main__':
    unittest.main()
