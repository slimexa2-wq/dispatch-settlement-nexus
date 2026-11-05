import unittest
from ultra_modules.BankBatchTransferFormatter_anomaly_radar import BankBatchTransferFormatter

class TestBankBatchTransferFormatter(unittest.TestCase):
    def setUp(self):
        self.formatter = BankBatchTransferFormatter()

    def test_normal_execution(self):
        records = [
            {'name': 'Alice', 'card_number': '6222021234567890123', 'amount': 5000.0},
            {'name': 'Bob', 'card_number': '6228481234567890123', 'amount': 5500.0},
            {'name': 'Charlie', 'card_number': '6214831234567890', 'amount': 6000.0},
        ]

        # We need a valid card number for this test to be green
        # Using a known valid luhn number: 4000000000000014 (Visa test, wait it's not starting with 6, but valid luhn)
        # Let's generate a valid luhn or use a mock. We will just use valid luhn numbers.
        # "79927398713" is valid.
        records = [
            {'name': 'Alice', 'card_number': '4000000000000002', 'amount': 5000.0},
            {'name': 'Bob', 'card_number': '4000000000000002', 'amount': 5500.0},
            {'name': 'Charlie', 'card_number': '4000000000000002', 'amount': 6000.0},
        ]

        processed = self.formatter.process_batch(records)

        self.assertEqual(len(processed), 3)
        self.assertTrue(all(r['is_valid_card'] for r in processed))
        self.assertEqual(processed[0]['status'], 'green')

    def test_dirty_data_self_healing(self):
        # Invalid cards and weird amount formats
        records = [
            {'name': 'Alice', 'card_number': '4000 0000 0000 0002', 'amount': '$5,000.50'},
            {'name': 'Bob', 'card_number': '4000-0000-0000-0002', 'amount': ' ¥ 6000  '},
            {'name': 'Charlie', 'card_number': 'invalid', 'amount': 'Not a number'},
        ]

        processed = self.formatter.process_batch(records)
        self.assertEqual(len(processed), 3)

        self.assertEqual(processed[0]['amount'], 5000.50)
        self.assertEqual(processed[0]['card_number'], '4000000000000002')
        self.assertTrue(processed[0]['is_valid_card'])

        self.assertEqual(processed[1]['amount'], 6000.0)

        self.assertEqual(processed[2]['amount'], 0.0)
        self.assertFalse(processed[2]['is_valid_card'])
        self.assertEqual(processed[2]['status'], 'red')

    def test_missing_parameters_fallback(self):
        records = [
            {'missing_name': 'NoCardNoAmount'},
            {'card_number': '4000000000000002'}, # No name, no amount
            {'amount': 1000}, # No name, no card
        ]

        processed = self.formatter.process_batch(records)
        self.assertEqual(len(processed), 3)

        # First record
        self.assertEqual(processed[0]['name'], 'Unknown')
        self.assertEqual(processed[0]['amount'], 0.0)
        self.assertEqual(processed[0]['card_number'], '')
        self.assertFalse(processed[0]['is_valid_card'])

        # Second record
        self.assertEqual(processed[1]['name'], 'Unknown')
        self.assertEqual(processed[1]['amount'], 0.0)
        self.assertEqual(processed[1]['card_number'], '4000000000000002')
        self.assertTrue(processed[1]['is_valid_card'])

        # Third record
        self.assertEqual(processed[2]['name'], 'Unknown')
        self.assertEqual(processed[2]['amount'], 1000.0)
        self.assertEqual(processed[2]['card_number'], '')
        self.assertFalse(processed[2]['is_valid_card'])

    def test_extreme_boundary_conditions(self):
        # Empty batch
        self.assertEqual(self.formatter.process_batch([]), [])

        # Huge amounts and tiny amounts
        records = [
            {'name': 'A', 'card_number': '4000000000000002', 'amount': 1e12},
            {'name': 'B', 'card_number': '4000000000000002', 'amount': -500.5},
            {'name': 'C', 'card_number': '4000000000000002', 'amount': 0.0},
        ]
        processed = self.formatter.process_batch(records)
        self.assertEqual(len(processed), 3)

        # Due to Z-score, the 1e12 amount will definitely be a red anomaly
        self.assertEqual(processed[0]['status'], 'red')
        self.assertEqual(processed[0]['reason'], '金额异常偏高(建议核实)')

        self.assertEqual(processed[1]['amount'], -500.5)

    def test_luhn_algorithm_validation(self):
        self.assertTrue(self.formatter.validate_luhn('4000000000000002'))
        # Changing one digit should make it invalid
        self.assertFalse(self.formatter.validate_luhn('4000000000000003'))
        self.assertFalse(self.formatter.validate_luhn('not-a-number'))
        self.assertFalse(self.formatter.validate_luhn('123')) # Too short

    def test_top_3_percent_anomaly_radar(self):
        # Generate 100 records
        records = []
        for i in range(97):
            records.append({'name': f'Emp{i}', 'card_number': '4000000000000002', 'amount': 5000.0 + i})

        # Top 3 anomalies
        records.append({'name': 'Boss1', 'card_number': '4000000000000002', 'amount': 50000.0})
        records.append({'name': 'Boss2', 'card_number': '4000000000000002', 'amount': 55000.0})
        records.append({'name': 'Boss3', 'card_number': '4000000000000002', 'amount': 60000.0})

        processed = self.formatter.process_batch(records)
        self.assertEqual(len(processed), 100)

        red_count = sum(1 for r in processed if r['status'] == 'red' and '异常偏高' in r['reason'])
        self.assertEqual(red_count, 3)

        # Check that top 3 are red
        top_amounts = [50000.0, 55000.0, 60000.0]
        for r in processed:
            if r['amount'] in top_amounts:
                self.assertEqual(r['status'], 'red')

if __name__ == '__main__':
    unittest.main()
