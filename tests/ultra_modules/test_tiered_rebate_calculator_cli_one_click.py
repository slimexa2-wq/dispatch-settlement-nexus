import unittest
import os
import json
from ultra_modules.tiered_rebate_calculator_cli_one_click import calculate_rebate, TieredRebateCLI, _clean_number

class TestTieredRebateCalculator(unittest.TestCase):

    def setUp(self):
        # Clean up any previously generated files
        if os.path.exists('rebate_results.json'):
            os.remove('rebate_results.json')
        if os.path.exists('rebate_results.csv'):
            os.remove('rebate_results.csv')

    def tearDown(self):
        # Clean up generated files
        if os.path.exists('rebate_results.json'):
            os.remove('rebate_results.json')
        if os.path.exists('rebate_results.csv'):
            os.remove('rebate_results.csv')

    def test_clean_number(self):
        """Test the _clean_number helper for various dirty data types."""
        self.assertEqual(_clean_number(None), 0.0)
        self.assertEqual(_clean_number(''), 0.0)
        self.assertEqual(_clean_number('  '), 0.0)
        self.assertEqual(_clean_number('invalid'), 0.0)
        self.assertEqual(_clean_number('1,000.5'), 1000.5)
        self.assertEqual(_clean_number(-5.0), 0.0)  # non-negative check
        self.assertEqual(_clean_number(10), 10.0)
        self.assertEqual(_clean_number(' 15.5 '), 15.5)

    def test_calculate_rebate_normal(self):
        """Test normal scenarios for tiered rebate calculation."""
        worker = {'worker_id': 'W1', 'days_worked': 32, 'absent_days': 1}
        result = calculate_rebate(worker)
        self.assertEqual(result['worker_id'], 'W1')
        self.assertEqual(result['days_worked'], 32.0)
        self.assertEqual(result['absent_days'], 1.0)
        self.assertEqual(result['achieved_tier'], 30)
        self.assertEqual(result['base_rebate'], 2000.0)
        self.assertEqual(result['deduction'], 100.0)
        self.assertEqual(result['final_amount'], 1900.0)

    def test_calculate_rebate_dirty_data_self_healing(self):
        """Test with dirty data like invalid strings or weird types to ensure it self-heals."""
        worker = {'worker_id': ' W2 ', 'days_worked': ' 16 ', 'absent_days': 'invalid'}
        result = calculate_rebate(worker)
        self.assertEqual(result['worker_id'], 'W2')
        self.assertEqual(result['days_worked'], 16.0)
        self.assertEqual(result['absent_days'], 0.0)
        self.assertEqual(result['achieved_tier'], 15)
        self.assertEqual(result['base_rebate'], 1000.0)
        self.assertEqual(result['deduction'], 0.0)
        self.assertEqual(result['final_amount'], 1000.0)

        # Test completely wrong data type for worker
        result2 = calculate_rebate(["not", "a", "dict"])
        self.assertEqual(result2['worker_id'], 'AUTO_RECOVERED')
        self.assertEqual(result2['days_worked'], 0.0)
        self.assertEqual(result2['achieved_tier'], 0)
        self.assertEqual(result2['final_amount'], 0.0)

    def test_calculate_rebate_missing_parameter_fallback(self):
        """Test missing parameters to verify sensible defaults."""
        worker = {}  # Empty worker
        result = calculate_rebate(worker)
        self.assertEqual(result['worker_id'], 'UNKNOWN')
        self.assertEqual(result['days_worked'], 0.0)
        self.assertEqual(result['absent_days'], 0.0)
        self.assertEqual(result['achieved_tier'], 0)
        self.assertEqual(result['base_rebate'], 0.0)
        self.assertEqual(result['deduction'], 0.0)
        self.assertEqual(result['final_amount'], 0.0)

    def test_calculate_rebate_extreme_boundaries(self):
        """Test extreme boundaries like very high deduction resulting in 0, not negative."""
        worker = {'worker_id': 'W3', 'days_worked': 7, 'absent_days': 10}
        result = calculate_rebate(worker)
        self.assertEqual(result['achieved_tier'], 7)
        self.assertEqual(result['base_rebate'], 500.0)
        self.assertEqual(result['deduction'], 1000.0)
        self.assertEqual(result['final_amount'], 0.0)  # Should max(0, rebate - deduction)

    def test_cli_one_click_defaults(self):
        """Test the zero-parameter CLI runner produces JSON properly."""
        outfile = TieredRebateCLI.run()
        self.assertEqual(outfile, 'rebate_results.json')
        self.assertTrue(os.path.exists(outfile))

        with open(outfile, 'r', encoding='utf-8') as f:
            results = json.load(f)

        self.assertEqual(len(results), 6) # From the default fallback data
        self.assertEqual(results[0]['worker_id'], 'W001')
        self.assertEqual(results[-1]['worker_id'], 'AUTO_RECOVERED')

    def test_cli_excel_format(self):
        """Test the CLI running with CSV/Excel output."""
        outfile = TieredRebateCLI.run(output_format='csv')
        self.assertEqual(outfile, 'rebate_results.csv')
        self.assertTrue(os.path.exists(outfile))
        with open(outfile, 'r', encoding='utf-8-sig') as f:
            content = f.read()
            self.assertIn('worker_id', content)
            self.assertIn('W001', content)
            self.assertIn('AUTO_RECOVERED', content)

if __name__ == '__main__':
    unittest.main()
