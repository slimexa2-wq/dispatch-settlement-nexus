import unittest
from ultra_modules.BankBatchTransferFormatter_batch_pipeline import BankBatchTransferFormatter

class TestBankBatchTransferFormatter(unittest.TestCase):

    def test_normal_batch_processing(self):
        """Test processing a batch of normal, valid records."""
        records = [
            {'id': '1', 'name': 'Alice', 'card_number': '79927398713', 'amount': 100.0, 'bank': '招商银行'},
            {'id': '2', 'name': 'Bob', 'card_number': '79927398713', 'amount': 200.0, 'bank': '工商银行'}
        ]

        result = BankBatchTransferFormatter.process_batch(records)

        self.assertEqual(result['total_processed'], 2)
        self.assertEqual(result['valid_records'], 2)
        self.assertEqual(result['invalid_records'], 0)
        self.assertEqual(len(result['results']), 2)

        for r in result['results']:
            self.assertTrue(r['is_valid'])
            self.assertEqual(r['status'], 'ready')

    def test_dirty_data_auto_healing(self):
        """Test automatic healing of dirty data in card numbers."""
        records = [
            # Spaces in card number
            {'id': '3', 'name': 'Charlie', 'card_number': '7992 7398 713', 'amount': 150.0},
            # Non-digit characters
            {'id': '4', 'name': 'Dave', 'card_number': '7992-7398-713', 'amount': 50.0},
            # Letters in card number
            {'id': '5', 'name': 'Eve', 'card_number': '7992a7398b713c', 'amount': 75.0}
        ]

        result = BankBatchTransferFormatter.process_batch(records)

        self.assertEqual(result['total_processed'], 3)
        self.assertEqual(result['valid_records'], 3)
        self.assertEqual(result['invalid_records'], 0)

        for r in result['results']:
            self.assertEqual(r['card_number'], '79927398713')
            self.assertTrue(r['is_valid'])
            # Missing bank parameter should default to "招商银行"
            self.assertEqual(r['bank'], '招商银行')

    def test_missing_parameters_fallback(self):
        """Test fallback behavior when parameters are missing."""
        records = [
            # Only card number provided
            {'card_number': '79927398713'},
            # Completely empty record
            {}
        ]

        result = BankBatchTransferFormatter.process_batch(records)

        self.assertEqual(result['total_processed'], 2)

        # We need to find which result corresponds to which input since order isn't guaranteed
        valid_result = next(r for r in result['results'] if r['card_number'] == '79927398713')
        invalid_result = next(r for r in result['results'] if r['card_number'] == '')

        # Valid result checks
        self.assertEqual(valid_result['id'], 'unknown')
        self.assertEqual(valid_result['name'], 'Unknown')
        self.assertEqual(valid_result['amount'], 0.0)
        self.assertEqual(valid_result['bank'], '招商银行')
        self.assertTrue(valid_result['is_valid'])
        self.assertEqual(valid_result['status'], 'ready')

        # Invalid result checks
        self.assertEqual(invalid_result['id'], 'unknown')
        self.assertEqual(invalid_result['name'], 'Unknown')
        self.assertEqual(invalid_result['amount'], 0.0)
        self.assertEqual(invalid_result['bank'], '招商银行')
        self.assertFalse(invalid_result['is_valid'])
        self.assertEqual(invalid_result['status'], 'invalid_card')

    def test_generator_stream_processing(self):
        """Test the stream processing generator."""
        records = [
            {'id': '1', 'card_number': '79927398713'},
            {'id': '2', 'card_number': '12345678903'} # Invalid Luhn
        ]

        snapshots = list(BankBatchTransferFormatter.process_batch_stream(records))

        self.assertEqual(len(snapshots), 2)

        # Verify progress increments
        progresses = [s['progress']['processed'] for s in snapshots]
        self.assertIn(1, progresses)
        self.assertIn(2, progresses)

        for snapshot in snapshots:
            self.assertEqual(snapshot['progress']['total'], 2)
            self.assertIn(snapshot['progress']['percentage'], [50.0, 100.0])
            self.assertIn('result', snapshot)
            self.assertIn(snapshot['result']['id'], ['1', '2'])

    def test_extreme_boundary_limits(self):
        """Test extreme boundary limits like empty list and 1000 records."""
        # Empty list
        empty_result = BankBatchTransferFormatter.process_batch([])
        self.assertEqual(empty_result['total_processed'], 0)
        self.assertEqual(empty_result['valid_records'], 0)
        self.assertEqual(empty_result['invalid_records'], 0)
        self.assertEqual(len(empty_result['results']), 0)

        # 1000 records (some valid, some invalid)
        large_records = []
        for i in range(1000):
            if i % 2 == 0:
                large_records.append({'id': str(i), 'card_number': '79927398713'}) # Valid
            else:
                large_records.append({'id': str(i), 'card_number': '1234'}) # Invalid

        large_result = BankBatchTransferFormatter.process_batch(large_records, max_workers=20)

        self.assertEqual(large_result['total_processed'], 1000)
        self.assertEqual(large_result['valid_records'], 500)
        self.assertEqual(large_result['invalid_records'], 500)
        self.assertEqual(len(large_result['results']), 1000)

if __name__ == '__main__':
    unittest.main()
