import unittest
import time
from ultra_modules.BankBatchTransferFormatter_self_healing_guard import BankBatchTransferFormatter

class TestBankBatchTransferFormatter(unittest.TestCase):
    def setUp(self):
        self.formatter = BankBatchTransferFormatter()

    def test_normal_execution(self):
        """Test with clean, correct data."""
        data = [
            {"name": "Alice", "account_number": "79927398713", "amount": 100.50},
            {"name": "Bob", "account_number": "79927398710", "amount": 200.0}
        ]
        result = self.formatter.process(data)

        self.assertTrue("snapshot_id" in result)
        processed = result["processed_data"]
        self.assertEqual(len(processed), 2)

        # Valid Luhn
        self.assertEqual(processed[0]["name"], "Alice")
        self.assertEqual(processed[0]["account_number"], "79927398713")
        self.assertTrue(processed[0]["is_valid_account"])
        self.assertEqual(processed[0]["amount"], 100.50)

        # Invalid Luhn
        self.assertEqual(processed[1]["name"], "Bob")
        self.assertEqual(processed[1]["account_number"], "79927398710")
        self.assertFalse(processed[1]["is_valid_account"])
        self.assertEqual(processed[1]["amount"], 200.0)

    def test_dirty_data_self_healing(self):
        """Test with dirty strings in account and amount."""
        data = [
            {
                "name": " Charlie  ",
                "account_number": "79-927 398 713!!",
                "amount": " ¥ 1,000.50 "
            }
        ]
        result = self.formatter.process(data)
        processed = result["processed_data"]

        self.assertEqual(processed[0]["name"], "Charlie")
        self.assertEqual(processed[0]["account_number"], "79927398713")
        self.assertTrue(processed[0]["is_valid_account"])
        self.assertEqual(processed[0]["amount"], 1000.50)

    def test_missing_parameter_default_fallback(self):
        """Test with completely missing parameters or None values."""
        data = [
            {}, # Empty dict
            {"name": None, "account_number": None, "amount": None},
            {"name": "", "account_number": "abc", "amount": "invalid"}
        ]
        result = self.formatter.process(data)
        processed = result["processed_data"]

        for p in processed:
            self.assertEqual(p["name"], "未知")
            self.assertEqual(p["account_number"], "")
            self.assertFalse(p["is_valid_account"])
            self.assertEqual(p["amount"], 0.0)

    def test_extreme_boundary_conditions(self):
        """Test with completely invalid input types."""
        # Not a list
        result = self.formatter.process(None)
        self.assertEqual(result["processed_data"], [])

        # List of invalid types
        result = self.formatter.process([123, "string", None, []])
        self.assertEqual(result["processed_data"], [])

    def test_snapshot_undo_mechanism(self):
        """Test snapshot creation, valid undo within 5s, and expired undo."""
        data = [{"name": "David", "account_number": "79927398713", "amount": 500}]

        # Process data to get snapshot
        result = self.formatter.process(data)
        snapshot_id = result["snapshot_id"]

        # Immediate Undo
        undo_result = self.formatter.undo(snapshot_id)
        self.assertTrue(undo_result["success"])
        self.assertEqual(undo_result["data"], data)
        self.assertEqual(undo_result["message"], "Undo successful")

        # Invalid ID Undo
        undo_result = self.formatter.undo("invalid-id")
        self.assertFalse(undo_result["success"])

        # Test expiration by modifying the timestamp directly to be older than 5s
        self.formatter._snapshots[snapshot_id]["timestamp"] -= 6.0

        expired_result = self.formatter.undo(snapshot_id)
        self.assertFalse(expired_result["success"])
        self.assertEqual(expired_result["message"], "Snapshot expired")

if __name__ == "__main__":
    unittest.main()
