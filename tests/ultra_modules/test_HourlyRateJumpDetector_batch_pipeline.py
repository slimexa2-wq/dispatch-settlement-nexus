import unittest
from datetime import datetime
from ultra_modules.HourlyRateJumpDetector_batch_pipeline import HourlyRateJumpDetectorPipeline

class TestHourlyRateJumpDetectorPipeline(unittest.TestCase):
    def setUp(self):
        self.pipeline = HourlyRateJumpDetectorPipeline(jump_threshold=0.3, default_max_workers=2)

    def test_normal_rate_progression(self):
        """Test case 1: normal rate progression within policy bounds."""
        records = [
            {
                'id': 'rec1',
                'project_id': 'proj1',
                'job_role': 'dev',
                'previous_rate': 100,
                'current_rate': 110,
                'policy_start_date': '2023-01-01',
                'policy_end_date': '2023-12-31',
                'effective_date': '2023-06-01'
            }
        ]
        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['valid'], 1)
        self.assertEqual(result['invalid'], 0)
        self.assertTrue(result['results'][0]['is_valid'])

    def test_recovery_from_dirty_data(self):
        """Test case 2: self-healing and recovery from dirty data."""
        records = [
            {
                'id': 'rec2',
                'project_id': None,
                'job_role': '',
                'previous_rate': 'invalid_rate',
                'current_rate': '150.5',
                'policy_start_date': 'invalid_date',
                'policy_end_date': None,
                'effective_date': '2026-06-01T12:00:00Z' # Make sure it stays within bounds if defaulted
            }
        ]
        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['valid'], 1)  # invalid_rate -> 0.0, current_rate -> 150.5, previous_rate 0 skips jump check
        res = result['results'][0]
        self.assertTrue(res['is_valid'])
        self.assertEqual(res['processed_data']['previous_rate'], 0.0)
        self.assertEqual(res['processed_data']['current_rate'], 150.5)
        self.assertEqual(res['processed_data']['project_id'], 'default_project')
        self.assertEqual(res['processed_data']['job_role'], 'default_role')

    def test_fallback_missing_parameters(self):
        """Test case 3: missing parameters entirely."""
        records = [
            {
                'id': 'rec3',
                # Provide valid dates to pass policy bounds check which defaults to 1970 - 2099
                'effective_date': '2023-06-01'
            } # only ID provided
        ]
        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['valid'], 1)
        res = result['results'][0]
        self.assertTrue(res['is_valid'])
        self.assertEqual(res['processed_data']['previous_rate'], 0.0)
        self.assertEqual(res['processed_data']['current_rate'], 0.0)

    def test_abnormal_rate_jump_detection(self):
        """Test case 4: abnormal rate jump detection."""
        records = [
            {
                'id': 'rec4',
                'previous_rate': 100,
                'current_rate': 131, # 31% jump, threshold is 30%
            }
        ]
        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['valid'], 0)
        self.assertEqual(result['invalid'], 1)
        res = result['results'][0]
        self.assertFalse(res['is_valid'])
        self.assertEqual(len(res['issues']), 1)
        self.assertIn("Abnormal rate jump", res['issues'][0])

    def test_out_of_bounds_policy_dates(self):
        """Test case 5: out-of-bounds policy dates."""
        records = [
            {
                'id': 'rec5',
                'previous_rate': 100,
                'current_rate': 110,
                'policy_start_date': '2023-01-01',
                'policy_end_date': '2023-12-31',
                'effective_date': '2024-01-01' # out of bounds
            }
        ]
        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['valid'], 0)
        self.assertEqual(result['invalid'], 1)
        res = result['results'][0]
        self.assertFalse(res['is_valid'])
        self.assertEqual(len(res['issues']), 1)
        self.assertIn("Effective date is out of policy bounds", res['issues'][0])

    def test_batch_processing_large(self):
        """Test case 6: handling larger batches concurrently."""
        records = [
            {
                'id': f'rec_{i}',
                'previous_rate': 100,
                'current_rate': 110 if i % 2 == 0 else 150 # even = valid, odd = invalid (50% jump)
            } for i in range(100)
        ]
        result = self.pipeline.process_batch(records, max_workers=5)
        self.assertEqual(result['total'], 100)
        self.assertEqual(result['valid'], 50)
        self.assertEqual(result['invalid'], 50)
        self.assertEqual(result['completion_rate'], 1.0)
        self.assertEqual(len(result['results']), 100)

if __name__ == '__main__':
    unittest.main()
