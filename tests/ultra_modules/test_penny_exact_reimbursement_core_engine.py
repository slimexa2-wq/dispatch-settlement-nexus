import unittest
from ultra_modules.penny_exact_reimbursement_core_engine import parse_amount_to_cents, process_reimbursements

class TestPennyExactReimbursementCoreEngine(unittest.TestCase):

    def test_normal_data(self):
        """Test normal int and float inputs without precision issues."""
        self.assertEqual(parse_amount_to_cents(100), 10000)
        self.assertEqual(parse_amount_to_cents(100.5), 10050)
        self.assertEqual(parse_amount_to_cents("200.25"), 20025)
        self.assertEqual(parse_amount_to_cents(10.12), 1012)

    def test_dirty_data_self_healing(self):
        """Test strings with currency symbols, whitespaces, and commas."""
        self.assertEqual(parse_amount_to_cents(" ¥ 1,000.50 "), 100050)
        self.assertEqual(parse_amount_to_cents("$20.00"), 2000)
        self.assertEqual(parse_amount_to_cents("1,234,567.89"), 123456789)
        self.assertEqual(parse_amount_to_cents("invalid_string"), 0) # Silently falls back to 0

    def test_missing_parameter_fallback(self):
        """Test missing parameter fallback (None, empty inputs)."""
        self.assertEqual(parse_amount_to_cents(None), 0)
        self.assertEqual(parse_amount_to_cents(""), 0)

        # Test process_reimbursements with None or empty list
        res_none = process_reimbursements(None)
        self.assertEqual(res_none['total_cents'], 0)
        self.assertEqual(res_none['processed_records'], [])

        res_empty = process_reimbursements([])
        self.assertEqual(res_empty['total_cents'], 0)

    def test_extreme_boundaries(self):
        """Test extreme boundaries like float imprecision, negative values, very large values."""
        # Float imprecision (e.g. 0.1 + 0.2 = 0.30000000000000004 in standard float, should be cleanly 30 cents)
        self.assertEqual(parse_amount_to_cents(0.1 + 0.2), 30)

        # Rounding check
        self.assertEqual(parse_amount_to_cents(10.555), 1056)
        self.assertEqual(parse_amount_to_cents(10.554), 1055)

        # Negative values
        self.assertEqual(parse_amount_to_cents(-50.25), -5025)

        # Large values
        self.assertEqual(parse_amount_to_cents("999999999.99"), 99999999999)

    def test_invoice_deduplication(self):
        """Test silent de-duplication of invoices and sum correctness."""
        records = [
            {"invoice_no": "INV-001", "amount": "100.00"},
            {"invoice_no": "INV-002", "amount": "¥50.50"},
            {"invoice_no": "INV-001", "amount": 200}, # Duplicate invoice, should be ignored
            {"invoice_no": " INV-003 ", "amount": 10.12}, # Whitespace in invoice_no
            {"invoice_no": "INV-003", "amount": 5}, # Trimmed duplicate invoice, should be ignored
            {"amount": 10}, # No invoice no, should be processed
            "invalid_record_type" # Should be skipped
        ]

        result = process_reimbursements(records)

        self.assertEqual(result['total_cents'], 10000 + 5050 + 1012 + 1000)
        self.assertEqual(len(result['processed_records']), 4)

        invoices = [r['invoice_no'] for r in result['processed_records']]
        self.assertEqual(invoices, ["INV-001", "INV-002", "INV-003", None])

if __name__ == '__main__':
    unittest.main()
