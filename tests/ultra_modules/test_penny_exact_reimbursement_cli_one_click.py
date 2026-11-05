import unittest
import decimal
from ultra_modules.penny_exact_reimbursement_cli_one_click import ReimbursementProcessor, Adapter

class TestPennyExactReimbursement(unittest.TestCase):
    def setUp(self):
        self.processor = ReimbursementProcessor()

    def test_normal_case(self):
        """Test normal data processing with valid strings."""
        result = self.processor.process_reimbursement(
            employee_id="E001",
            invoice_number="INV_1001",
            amount_yuan="15.65"
        )
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["amount_cents"], 1565)
        self.assertEqual(result["amount_yuan"], "15.65")

    def test_dirty_data_self_healing(self):
        """Test self-healing on dirty data like floats, commas, spaces, and dollar signs."""
        # Floating point
        res_float = self.processor.process_reimbursement(
            employee_id="E002",
            invoice_number="INV_1002",
            amount_yuan=12.34
        )
        self.assertEqual(res_float["amount_cents"], 1234)

        # String with spaces and signs
        res_str = self.processor.process_reimbursement(
            employee_id="E003",
            invoice_number="INV_1003",
            amount_yuan=" $  1,234.56 "
        )
        self.assertEqual(res_str["amount_cents"], 123456)

        # High precision rounding
        res_round = self.processor.process_reimbursement(
            employee_id="E004",
            invoice_number="INV_1004",
            amount_yuan="12.345"
        )
        self.assertEqual(res_round["amount_cents"], 1235)  # half up rounding 12.345 -> 12.35 -> 1235

    def test_missing_parameter_fallback(self):
        """Test zero-parameter / missing parameter fallback behavior."""
        result = self.processor.process_reimbursement()
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["employee_id"], "EMP_000000")
        self.assertEqual(result["invoice_number"], "INV_DEFAULT_01")
        self.assertEqual(result["amount_cents"], 1234)

    def test_extreme_edge_cases(self):
        """Test extreme boundary cases (large numbers, invalid strings, tiny decimals)."""
        # Huge numbers
        res_huge = self.processor.process_reimbursement(
            employee_id="E005",
            invoice_number="INV_1005",
            amount_yuan="999999999999.99"
        )
        self.assertEqual(res_huge["amount_cents"], 99999999999999)

        # Invalid strings fallback to 0
        res_invalid = self.processor.process_reimbursement(
            employee_id="E006",
            invoice_number="INV_1006",
            amount_yuan="invalid_amount"
        )
        self.assertEqual(res_invalid["amount_cents"], 0)

        # Tiny decimals
        res_tiny = self.processor.process_reimbursement(
            employee_id="E007",
            invoice_number="INV_1007",
            amount_yuan="0.001"
        )
        self.assertEqual(res_tiny["amount_cents"], 0)

        # Negative values (valid, but depending on logic, let's make sure it handles them)
        res_neg = self.processor.process_reimbursement(
            employee_id="E008",
            invoice_number="INV_1008",
            amount_yuan="-50.25"
        )
        self.assertEqual(res_neg["amount_cents"], -5025)

    def test_anti_duplication_logic(self):
        """Test that the same invoice number is rejected on subsequent calls."""
        # First processing should succeed
        res1 = self.processor.process_reimbursement(
            employee_id="E009",
            invoice_number="INV_DUP",
            amount_yuan="100.00"
        )
        self.assertEqual(res1["status"], "success")

        # Second processing of the same invoice should fail
        res2 = self.processor.process_reimbursement(
            employee_id="E009",
            invoice_number="INV_DUP",
            amount_yuan="100.00"
        )
        self.assertEqual(res2["status"], "error")
        self.assertEqual(res2["message"], "duplicate_invoice")
        self.assertEqual(res2["amount_cents"], 0)

    def test_adapter_json_excel(self):
        """Test Adapter conversions for dual-mode output."""
        data = {
            "status": "success",
            "employee_id": "EMP_000000",
            "invoice_number": "INV_DEFAULT_01",
            "amount_cents": 1234,
            "amount_yuan": "12.34"
        }

        json_output = Adapter.to_json(data)
        self.assertIn('"amount_cents": 1234', json_output)

        csv_output = Adapter.to_excel_csv(data)
        self.assertIn('success,EMP_000000,INV_DEFAULT_01,1234,12.34', csv_output.strip().split("\r\n")[-1])

if __name__ == '__main__':
    unittest.main()
