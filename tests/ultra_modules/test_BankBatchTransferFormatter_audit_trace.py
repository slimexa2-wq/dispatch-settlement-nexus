import unittest
import csv
import io
from ultra_modules.BankBatchTransferFormatter_audit_trace import clean_and_format_transfers, is_luhn_valid

class TestBankBatchTransferFormatter(unittest.TestCase):

    def test_normal_operation_cmb(self):
        """Test 1: Normal operation with valid records and default CMB bank type."""
        records = [
            {"name": "Alice", "card_number": "79927398713", "amount": 1000.50}, # Valid Luhn
            {"name": "Bob", "card_number": "79927398714", "amount": 2000.00}    # Invalid Luhn
        ]
        result = clean_and_format_transfers(records, "CMB")

        self.assertEqual(len(result["cleaned_data"]), 2)
        self.assertTrue(result["cleaned_data"][0]["luhn_valid"])
        self.assertFalse(result["cleaned_data"][1]["luhn_valid"])

        # Check CSV
        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(rows[0], ["Name", "CardNumber", "Amount", "Bank", "Status"])
        self.assertEqual(rows[1], ["Alice", "79927398713", "1000.50", "CMB", "Luhn Valid"])
        self.assertEqual(rows[2], ["Bob", "79927398714", "2000.00", "CMB", "Luhn Invalid"])

    def test_dirty_data_auto_healing(self):
        """Test 2: Dirty data auto-healing (cleaning non-digits, negative amounts)."""
        records = [
            {"name": "Charlie", "card_number": " 123-456-7890 ", "amount": "-500.00"},
            {"name": "Dave", "card_number": "abc123456", "amount": "invalid_amount"},
            {"name": "Eve", "card_number": "123", "amount": "$1,200.50"}
        ]
        result = clean_and_format_transfers(records, "ICBC")

        self.assertEqual(len(result["cleaned_data"]), 3)
        self.assertEqual(result["cleaned_data"][0]["card_number"], "1234567890")
        self.assertEqual(result["cleaned_data"][0]["amount"], 0.0) # Negative amount defaulted to 0

        self.assertEqual(result["cleaned_data"][1]["card_number"], "123456")
        self.assertEqual(result["cleaned_data"][1]["amount"], 0.0) # Invalid amount defaulted to 0

        self.assertEqual(result["cleaned_data"][2]["card_number"], "123")
        self.assertEqual(result["cleaned_data"][2]["amount"], 1200.50) # Handled non-digit characters in amount

        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(rows[0], ["AccountName", "AccountNo", "TransferAmount", "BankName", "Notes"])

    def test_missing_parameters_fallback(self):
        """Test 3: Missing parameters fallback and deduplication."""
        records = [
            {"card_number": "79927398713"}, # Missing name and amount
            {"name": "Alice Duplicate", "card_number": "79927398713", "amount": 1500.00}, # Duplicate card
            "not_a_dict"
        ]
        result = clean_and_format_transfers(records, None)

        self.assertEqual(len(result["cleaned_data"]), 1)
        self.assertEqual(result["cleaned_data"][0]["name"], "Alice Duplicate")
        self.assertEqual(result["cleaned_data"][0]["amount"], 1500.00)
        self.assertEqual(result["cleaned_data"][0]["bank_type"], "CMB") # Fallback to CMB

        self.assertIn("Duplicate card number", str(result["audit_trace"]))
        self.assertIn("not a dictionary", str(result["audit_trace"]))

    def test_luhn_validation_edge_cases(self):
        """Test 4: Luhn validation edge cases."""
        self.assertFalse(is_luhn_valid(""))
        self.assertFalse(is_luhn_valid(None))
        self.assertFalse(is_luhn_valid("abc"))
        self.assertFalse(is_luhn_valid(123456)) # Not a string

        # Valid Luhn
        self.assertTrue(is_luhn_valid("79927398713"))

        # Check within function
        records = [{"name": "Test", "card_number": None, "amount": 100}]
        result = clean_and_format_transfers(records)
        self.assertEqual(len(result["cleaned_data"]), 0) # Card number empty after cleaning

    def test_extreme_bounds(self):
        """Test 5: Extreme bounds (empty lists, None input, different banks)."""
        # None input
        result1 = clean_and_format_transfers(None)
        self.assertEqual(len(result1["cleaned_data"]), 0)

        # Empty list
        result2 = clean_and_format_transfers([])
        self.assertEqual(len(result2["cleaned_data"]), 0)

        # Bank formatting CCB
        records = [{"name": "Test", "card_number": "123", "amount": True}] # Bool amount -> float(True) is 1.0, but handled by type check or fallback? Wait, float(True) is 1.0, but I wrote `not isinstance(original_amount, bool)` so it falls to regex, which yields 0.0
        result3 = clean_and_format_transfers(records, "CCB")

        self.assertEqual(result3["cleaned_data"][0]["amount"], 0.0) # True is stripped by regex or fallback to 0.0

        csv_reader = csv.reader(io.StringIO(result3["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(rows[0], ["ReceiverName", "ReceiverAccount", "Amount", "TargetBank", "Remarks"])

    def test_edge_cases_and_branch_coverage(self):
        """Test 6: Additional cases to ensure 100% branch coverage."""
        class Unconvertible:
            def __str__(self):
                raise ValueError("Cannot convert to string")

        records = [
            {"name": None, "card_number": "123", "amount": 100.0},
            {"name": "   ", "card_number": "456", "amount": 200.0},
            {"name": "ErrorAmount", "card_number": "789", "amount": Unconvertible()}
        ]
        result = clean_and_format_transfers(records, "OTHER_BANK")
        self.assertEqual(result["cleaned_data"][0]["name"], "Unknown")
        self.assertEqual(result["cleaned_data"][1]["name"], "Unknown")

        csv_reader = csv.reader(io.StringIO(result["csv_content"]))
        rows = list(csv_reader)
        self.assertEqual(rows[0], ["Name", "CardNumber", "Amount", "Bank", "Status"])
        self.assertEqual(rows[1][3], "OTHER_BANK")

if __name__ == "__main__":
    unittest.main()
