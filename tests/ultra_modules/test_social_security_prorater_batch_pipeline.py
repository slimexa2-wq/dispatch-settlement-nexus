import unittest
import sys
import os

# Add root project dir to path so we can import ultra_modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from ultra_modules.social_security_prorater_batch_pipeline import SocialSecurityProraterBatchPipeline

class TestSocialSecurityProraterBatchPipeline(unittest.TestCase):

    def setUp(self):
        self.pipeline = SocialSecurityProraterBatchPipeline()

    def test_normal_case_full_month(self):
        records = [{
            'employee_id': 'E001',
            'base_salary': 10000,
            'target_month': '2023-05',
            'onboard_date': '2022-01-01',
            'offboard_date': None
        }]
        results = self.pipeline.process_batch(records)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['active_days'], 31)
        self.assertEqual(res['proration_ratio'], 1.0)
        self.assertEqual(res['prorated_base'], 10000)
        self.assertEqual(res['deductions']['pension'], 800)

    def test_proration_joined_mid_month(self):
        records = [{
            'employee_id': 'E002',
            'base_salary': 10000,
            'target_month': '2023-06',
            'onboard_date': '2023-06-16',
            'offboard_date': None
        }]
        results = self.pipeline.process_batch(records)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['active_days'], 15) # 30 - 16 + 1 = 15
        self.assertEqual(res['days_in_month'], 30)
        self.assertEqual(res['proration_ratio'], 0.5)
        self.assertEqual(res['prorated_base'], 5000)

    def test_dirty_data_self_healing(self):
        records = [{
            'employee_id': 'E003',
            'base_salary': '¥10,000.50 gross',
            'target_month': '2023-02',
            'onboard_date': '2023.02.15',
            'offboard_date': 'INVALID'
        }]
        results = self.pipeline.process_batch(records)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['bounded_base'], 10000.50)
        self.assertEqual(res['days_in_month'], 28)
        self.assertEqual(res['active_days'], 14) # 28 - 15 + 1 = 14
        self.assertEqual(res['proration_ratio'], 0.5)

    def test_parameter_fallback(self):
        # Empty config should use defaults
        empty_pipeline = SocialSecurityProraterBatchPipeline({})
        records = [{
            'employee_id': 'E004',
            'base_salary': None, # Missing base
            'target_month': '2023-01'
        }]
        results = empty_pipeline.process_batch(records)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        self.assertEqual(res['bounded_base'], 3000.0) # Floored from 0
        self.assertEqual(res['prorated_base'], 3000.0)

    def test_extreme_boundaries(self):
        records = [{
            'employee_id': 'E005',
            'base_salary': 10000000, # Far above cap
            'target_month': '2023-01',
        }, {
            'employee_id': 'E006',
            'base_salary': -5000, # Below floor
            'target_month': '2023-01'
        }]
        results = self.pipeline.process_batch(records)
        results.sort(key=lambda x: x['employee_id'])

        res1 = results[0] # E005
        self.assertEqual(res1['bounded_base'], 30000.0) # Capped

        res2 = results[1] # E006
        self.assertEqual(res2['bounded_base'], 3000.0) # Floored

    def test_invalid_month_fallback(self):
        records = [{
            'employee_id': 'E007',
            'base_salary': 10000,
            'target_month': 'not-a-date',
            'onboard_date': None
        }]
        results = self.pipeline.process_batch(records)
        res = results[0]
        self.assertEqual(res['status'], 'success')
        # Since target month is invalid, it falls back to current year/month
        import datetime
        import calendar
        now = datetime.datetime.now()
        _, days = calendar.monthrange(now.year, now.month)
        self.assertEqual(res['days_in_month'], days)
        self.assertEqual(res['active_days'], days)
        self.assertEqual(res['proration_ratio'], 1.0)

if __name__ == '__main__':
    unittest.main()
