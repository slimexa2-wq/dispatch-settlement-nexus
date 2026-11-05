import unittest
from datetime import date
from ultra_modules.HourlyRateJumpDetector_plain_explainer import HourlyRateJumpDetectorExplainer

class TestHourlyRateJumpDetectorExplainer(unittest.TestCase):

    def setUp(self):
        self.detector = HourlyRateJumpDetectorExplainer(jump_threshold=0.2)

    def test_normal_case(self):
        """测试正常情况，不跳变或小幅跳变，都在范围内"""
        res = self.detector.explain(
            current_rate=100.0,
            previous_rate=110.0,  # 约 9% 下跌，低于 20%
            project_name="项目A",
            job_type="搬运",
            apply_date="2026-07-26",
            policy_start="2026-01-01",
            policy_end="2026-12-31"
        )
        self.assertEqual(res["json"]["status"], "PASS")
        self.assertEqual(len(res["json"]["issues"]), 0)
        self.assertIn("✅", res["json"]["summary"])

    def test_abnormal_jump(self):
        """测试异常跳变，超过阈值"""
        res = self.detector.explain(
            current_rate=150.0,
            previous_rate=100.0,  # 50% 上涨，超过 20%
            project_name="项目B",
            job_type="焊工",
            apply_date="2026-07-26",
            policy_start="2026-01-01",
            policy_end="2026-12-31"
        )
        self.assertEqual(res["json"]["status"], "FAIL")
        self.assertEqual(len(res["json"]["issues"]), 1)
        self.assertIn("单价较上期上涨了 50.0%", res["json"]["issues"][0])
        self.assertIn("⚠️", res["json"]["summary"])

    def test_out_of_bounds_policy(self):
        """测试政策日期越界"""
        # 早于开始
        res_early = self.detector.explain(
            current_rate=100.0, previous_rate=100.0,
            project_name="项目C", job_type="司机",
            apply_date="2025-12-31", policy_start="2026-01-01", policy_end="2026-12-31"
        )
        self.assertEqual(res_early["json"]["status"], "FAIL")
        self.assertTrue(any("早于" in issue for issue in res_early["json"]["issues"]))

        # 晚于结束
        res_late = self.detector.explain(
            current_rate=100.0, previous_rate=100.0,
            project_name="项目C", job_type="司机",
            apply_date="2027-01-01", policy_start="2026-01-01", policy_end="2026-12-31"
        )
        self.assertEqual(res_late["json"]["status"], "FAIL")
        self.assertTrue(any("晚于" in issue for issue in res_late["json"]["issues"]))

    def test_dirty_data(self):
        """测试脏数据自愈（非法数值、非法字符串、非法日期）"""
        res = self.detector.explain(
            current_rate="负数或非法字符串",  # 会 fall back 到 default 0.0
            previous_rate=-50,          # 负数会 fall back 到 current_rate
            project_name="   ",         # 空格项目名会 fall back
            job_type=None,
            apply_date="not-a-date",
            policy_start="123",
            policy_end=True
        )
        # fallback 后数据：rate=0.0， 无跳变， 日期无效被忽略， 所以正常
        self.assertEqual(res["json"]["status"], "PASS")
        self.assertEqual(res["json"]["current_rate"], 0.0)
        self.assertEqual(res["json"]["previous_rate"], 0.0)
        self.assertEqual(res["json"]["project_name"], "未知项目")
        self.assertEqual(res["json"]["job_type"], "未知工种")

    def test_missing_parameters(self):
        """测试缺参情况，应该默认不报错"""
        res = self.detector.explain(current_rate=100.0)
        # previous_rate = 100.0 (fallback to current_rate)
        # project_name = "未知项目"
        # job_type = "未知工种"
        self.assertEqual(res["json"]["status"], "PASS")
        self.assertEqual(res["json"]["current_rate"], 100.0)
        self.assertEqual(res["json"]["previous_rate"], 100.0)
        self.assertEqual(res["json"]["project_name"], "未知项目")
        self.assertEqual(len(res["json"]["issues"]), 0)

if __name__ == '__main__':
    unittest.main()
