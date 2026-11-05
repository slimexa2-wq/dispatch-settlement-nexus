import unittest
from ultra_modules.ResignedWorkerPayHold_batch_pipeline import ResignedWorkerPayHoldPipeline

class TestResignedWorkerPayHoldPipeline(unittest.TestCase):
    def setUp(self):
        self.pipeline = ResignedWorkerPayHoldPipeline(max_workers=10)

    def test_normal_flow(self):
        """Test normal resignation where penalty is applied correctly and within limits."""
        records = [
            {
                'worker_id': 'W001',
                'base_salary': 1000.0,
                'requested_penalty': 150.0,
                'is_abrupt_resignation': True
            },
            {
                'worker_id': 'W002',
                'base_salary': 1000.0,
                'requested_penalty': 50.0,
                'is_abrupt_resignation': False
            }
        ]

        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total_processed'], 2)
        self.assertEqual(result['success_count'], 2)

        # Sort results by worker_id to verify deterministically
        res_list = sorted(result['results'], key=lambda x: x['worker_id'])

        w1_result = res_list[0]
        self.assertEqual(w1_result['worker_id'], 'W001')
        self.assertEqual(w1_result['applied_penalty'], 150.0) # Within 20% of 1000 (200)
        self.assertEqual(w1_result['final_pay'], 850.0)

        w2_result = res_list[1]
        self.assertEqual(w2_result['worker_id'], 'W002')
        self.assertEqual(w2_result['applied_penalty'], 0.0) # Not abrupt, so 0 penalty
        self.assertEqual(w2_result['final_pay'], 1000.0)

    def test_dirty_data_auto_healing(self):
        """Test the system's ability to auto-heal dirty/corrupted data."""
        records = [
            {
                'worker_id': '  ', # Empty string
                'base_salary': 'invalid', # Invalid salary type
                'requested_penalty': -50.0, # Negative penalty
                'is_abrupt_resignation': 'yes' # String yes
            },
            {
                'worker_id': None,
                'base_salary': None,
                'requested_penalty': float('nan')
            }
        ]

        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total_processed'], 2)
        self.assertEqual(result['success_count'], 2)

        for res in result['results']:
            self.assertEqual(res['worker_id'], 'UNKNOWN')
            self.assertEqual(res['accrued_pay'], 0.0)
            self.assertEqual(res['requested_penalty'], 0.0)
            self.assertEqual(res['applied_penalty'], 0.0)
            self.assertEqual(res['final_pay'], 0.0)

    def test_empty_record_fallback(self):
        """Test fallback mechanisms when empty or completely wrong records are provided."""
        records = [
            {},
            None,
            "A completely invalid string record"
        ]

        result = self.pipeline.process_batch(records)
        self.assertEqual(result['total_processed'], 3)
        self.assertEqual(result['success_count'], 3)

        for res in result['results']:
            self.assertEqual(res['worker_id'], 'UNKNOWN')
            self.assertEqual(res['accrued_pay'], 0.0)
            self.assertEqual(res['final_pay'], 0.0)

    def test_compliance_limit_penalty(self):
        """Test that penalties exceeding the 20% limit are capped."""
        records = [
            {
                'worker_id': 'W100',
                'base_salary': 1000.0,
                'requested_penalty': 500.0, # 50% penalty, should be capped at 20%
                'is_abrupt_resignation': True
            }
        ]

        result = self.pipeline.process_batch(records)
        res = result['results'][0]

        self.assertEqual(res['worker_id'], 'W100')
        self.assertEqual(res['requested_penalty'], 500.0)
        self.assertEqual(res['applied_penalty'], 200.0) # Capped at 20% of 1000
        self.assertEqual(res['final_pay'], 800.0)

    def test_high_throughput_batch_processing(self):
        """Test batch processing performance and correctness for 1000 records."""
        records = [
            {
                'worker_id': f'W_{i}',
                'base_salary': 1000.0 + i,
                'requested_penalty': i * 0.5,
                'is_abrupt_resignation': (i % 2 == 0) # Every even record is abrupt
            }
            for i in range(1000)
        ]

        result = self.pipeline.process_batch(records)

        self.assertEqual(result['total_processed'], 1000)
        self.assertEqual(result['success_count'], 1000)
        self.assertEqual(result['failure_count'], 0)
        self.assertEqual(len(result['results']), 1000)

        # Verify a specific record
        w_500 = next(r for r in result['results'] if r['worker_id'] == 'W_500')
        self.assertEqual(w_500['accrued_pay'], 1500.0)
        self.assertEqual(w_500['requested_penalty'], 250.0)
        self.assertEqual(w_500['applied_penalty'], 250.0) # 250 <= 20% of 1500 (300)
        self.assertEqual(w_500['final_pay'], 1250.0)

if __name__ == '__main__':
    unittest.main()
