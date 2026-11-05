import unittest
from ultra_modules.penny_exact_reimbursement_export_formatter import format_reimbursement_export, to_integer_cents

class TestPennyExactReimbursementExportFormatter(unittest.TestCase):

    def test_to_integer_cents_normal(self):
        """Test normal conversion of yuan to integer cents."""
        self.assertEqual(to_integer_cents(1.23), 123)
        self.assertEqual(to_integer_cents("1.23"), 123)
        self.assertEqual(to_integer_cents(1), 100)
        self.assertEqual(to_integer_cents(0), 0)

    def test_to_integer_cents_dirty_data(self):
        """Test dirty data like NaN, None, and empty string."""
        self.assertEqual(to_integer_cents("NaN"), 0)
        self.assertEqual(to_integer_cents("nan"), 0)
        self.assertEqual(to_integer_cents(None), 0)
        self.assertEqual(to_integer_cents(""), 0)
        self.assertEqual(to_integer_cents("invalid"), 0)
        self.assertEqual(to_integer_cents({}), 0)
        self.assertEqual(to_integer_cents([]), 0)

    def test_to_integer_cents_floating_point(self):
        """Test floating point edge cases that usually cause problems."""
        self.assertEqual(to_integer_cents(1.13), 113)
        self.assertEqual(to_integer_cents(1.05), 105)
        self.assertEqual(to_integer_cents(2.05), 205)

    def test_format_export_normal(self):
        """Test normal processing of records."""
        records = [
            {"employee_id": "E1", "employee_name": "Alice", "amount_yuan": 1.23, "invoice_number": "INV001"},
            {"employee_id": "E2", "employee_name": "Bob", "amount_yuan": 2.50, "invoice_number": "INV002"}
        ]
        csv_out, report = format_reimbursement_export(records)
        self.assertIn("E1,Alice,123,INV001", csv_out)
        self.assertIn("E2,Bob,250,INV002", csv_out)
        self.assertIn("employee_id,employee_name,amount_cents,invoice_number", csv_out)
        self.assertIn("Processed 2 valid records", report)
        self.assertIn("Total Amount: 3.73 Yuan (373 Cents)", report)

    def test_format_export_deduplication(self):
        """Test deduplication of invoice numbers."""
        records = [
            {"employee_id": "E1", "employee_name": "Alice", "amount_yuan": 1.00, "invoice_number": "INV001"},
            {"employee_id": "E2", "employee_name": "Bob", "amount_yuan": 2.00, "invoice_number": "INV001"},
            {"employee_id": "E3", "employee_name": "Charlie", "amount_yuan": 3.00, "invoice_number": "INV002"}
        ]
        csv_out, report = format_reimbursement_export(records)
        self.assertIn("E1,Alice,100,INV001", csv_out)
        self.assertNotIn("Bob,200", csv_out) # Bob should be excluded due to duplicate invoice
        self.assertIn("E3,Charlie,300,INV002", csv_out)
        self.assertIn("Processed 2 valid records", report)
        self.assertIn("deduplicated 1 invoices", report)

    def test_format_export_missing_fields_and_dirty(self):
        """Test fallback for missing fields and dirty data."""
        records = [
            {"amount_yuan": None}, # Missing id, name, invoice, dirty amount
            {"employee_id": "NaN", "employee_name": "None", "amount_yuan": "nan", "invoice_number": "NaN"},
            {"employee_id": "", "employee_name": "", "amount_yuan": "", "invoice_number": ""}
        ]
        csv_out, report = format_reimbursement_export(records)
        # We expect defaults: UNKNOWN, Unknown, 0 cents
        # Missing invoice number shouldn't trigger dedup for other missing invoice numbers.
        self.assertEqual(csv_out.count("UNKNOWN,Unknown,0"), 3)
        self.assertIn("Processed 3 valid records", report)
        self.assertIn("Total Amount: 0.00 Yuan (0 Cents)", report)

    def test_format_export_invalid_input_type(self):
        """Test passing invalid input types to format function."""
        # Non-list input
        csv_out, report = format_reimbursement_export("not a list")
        self.assertIn("Processed 0 valid records", report)

        # List with non-dict items
        csv_out2, report2 = format_reimbursement_export([{"employee_id": "E1", "amount_yuan": 1}, "invalid_record"])
        self.assertIn("E1", csv_out2)
        self.assertIn("Processed 1 valid records", report2)

    def test_logger_handlers(self):
        """Test logger handler logic branch."""
        import importlib
        import ultra_modules.penny_exact_reimbursement_export_formatter as mod
        importlib.reload(mod)

if __name__ == '__main__':
    unittest.main()
