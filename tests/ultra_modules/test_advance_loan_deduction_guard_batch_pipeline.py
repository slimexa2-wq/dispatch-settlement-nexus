import unittest
from ultra_modules.advance_loan_deduction_guard_batch_pipeline import AdvanceLoanDeductionGuardBatchPipeline

class TestAdvanceLoanDeductionGuardBatchPipeline(unittest.TestCase):
    def setUp(self):
        self.pipeline = AdvanceLoanDeductionGuardBatchPipeline(max_concurrency=5)

    def test_normal_batch_processing(self):
        """Test case 1: Normal condition - advance is less than or equal to monthly salary."""
        batch_data = [
            {'worker_id': 'w1', 'monthly_salary': 5000.0, 'advance_loan': 1000.0},
            {'worker_id': 'w2', 'monthly_salary': 4000.0, 'advance_loan': 4000.0}
        ]
        result = self.pipeline.run_batch(batch_data)

        self.assertEqual(result['total_processed'], 2)
        self.assertEqual(result['successful'], 2)

        # Check w1
        w1 = next(r for r in result['results'] if r['worker_id'] == 'w1')
        self.assertEqual(w1['final_deduction'], 1000.0)
        self.assertEqual(w1['actual_payment'], 4000.0)

        # Check w2
        w2 = next(r for r in result['results'] if r['worker_id'] == 'w2')
        self.assertEqual(w2['final_deduction'], 4000.0)
        self.assertEqual(w2['actual_payment'], 0.0)

    def test_over_deduction_guard(self):
        """Test case 2: Extreme boundary - advance loan is larger than monthly salary."""
        batch_data = [
            {'worker_id': 'w_over', 'monthly_salary': 3000.0, 'advance_loan': 5000.0}
        ]
        result = self.pipeline.run_batch(batch_data)

        r = result['results'][0]
        self.assertEqual(r['final_deduction'], 3000.0)  # Max deduction is salary
        self.assertEqual(r['actual_payment'], 0.0)      # No negative payment
        self.assertEqual(r['status'], 'success')

    def test_dirty_data_healing(self):
        """Test case 3: Dirty data self-healing - string types, negative values."""
        batch_data = [
            {'worker_id': '  w_dirty  ', 'monthly_salary': '2500.50', 'advance_loan': '-500'},
            {'worker_id': None, 'monthly_salary': 'invalid', 'advance_loan': '100'}
        ]
        result = self.pipeline.run_batch(batch_data)

        # Check first record (auto strip worker_id, parse float, cap negative to 0)
        r1 = next(r for r in result['results'] if 'w_dirty' in r['worker_id'])
        self.assertEqual(r1['worker_id'], 'w_dirty')
        self.assertEqual(r1['monthly_salary'], 2500.50)
        self.assertEqual(r1['advance_loan'], 0.0)  # negative healed to 0
        self.assertEqual(r1['actual_payment'], 2500.50)

        # Check second record (None worker_id -> UNKNOWN_WORKER, invalid float -> 0.0)
        r2 = next(r for r in result['results'] if r['worker_id'] == 'UNKNOWN_WORKER')
        self.assertEqual(r2['monthly_salary'], 0.0)
        self.assertEqual(r2['advance_loan'], 100.0)
        self.assertEqual(r2['final_deduction'], 0.0)  # capped at salary which is 0
        self.assertEqual(r2['actual_payment'], 0.0)

    def test_missing_params_default(self):
        """Test case 4: Missing parameter default fallback."""
        batch_data = [
            {}, # completely empty
            {'worker_id': 'w_half'} # missing salary and loan
        ]
        result = self.pipeline.run_batch(batch_data)
        self.assertEqual(result['successful'], 2)

        r_empty = next(r for r in result['results'] if r['worker_id'] == 'UNKNOWN_WORKER')
        self.assertEqual(r_empty['monthly_salary'], 0.0)
        self.assertEqual(r_empty['advance_loan'], 0.0)

        r_half = next(r for r in result['results'] if r['worker_id'] == 'w_half')
        self.assertEqual(r_half['monthly_salary'], 0.0)

    def test_extreme_boundary_wrong_type(self):
        """Test case 5: Extreme boundaries - entire record is wrong type."""
        batch_data = [
            None,
            "string_instead_of_dict",
            12345
        ]
        result = self.pipeline.run_batch(batch_data)

        self.assertEqual(result['total_processed'], 3)
        self.assertEqual(result['successful'], 3)  # They auto-heal to empty dicts and get processed

        for r in result['results']:
            self.assertEqual(r['worker_id'], 'UNKNOWN_WORKER')
            self.assertEqual(r['monthly_salary'], 0.0)
            self.assertEqual(r['actual_payment'], 0.0)

    def test_high_throughput(self):
        """Test case 6: High throughput batching (1000 records)."""
        batch_data = [{'worker_id': f'w_{i}', 'monthly_salary': 5000, 'advance_loan': 100} for i in range(1000)]
        result = self.pipeline.run_batch(batch_data)

        self.assertEqual(result['total_processed'], 1000)
        self.assertEqual(result['successful'], 1000)
        self.assertEqual(result['failed'], 0)

if __name__ == '__main__':
    unittest.main()
