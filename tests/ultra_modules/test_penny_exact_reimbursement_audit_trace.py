import unittest
import math
from ultra_modules.penny_exact_reimbursement_audit_trace import process_reimbursements

class TestPennyExactReimbursementAuditTrace(unittest.TestCase):
    def test_normal_data(self):
        records = [
            {"id": "r1", "amount_yuan": "100.01", "invoice_numbers": ["INV001", "INV002"]},
            {"id": "r2", "amount_yuan": 50.555, "invoice_numbers": ["INV003"]}
        ]
        result = process_reimbursements(records)
        self.assertEqual(len(result["clean_results"]), 2)
        self.assertEqual(result["clean_results"][0]["amount_cents"], 10001)
        self.assertEqual(result["clean_results"][1]["amount_cents"], 5056) # 50.555 * 100 = 5055.5 -> round half up -> 5056
        self.assertEqual(result["total_amount_cents"], 15057)
        self.assertEqual(result["total_unique_invoices"], 3)
        self.assertTrue(any(trace["step"] == "amount_conversion_success" for trace in result["audit_trace"]))

    def test_missing_parameters_and_default_fallback(self):
        # Testing None input, missing id, missing amount, missing invoices
        result = process_reimbursements(None)
        self.assertEqual(result["clean_results"], [])

        # Dictionary missing everything
        result = process_reimbursements([{}])
        self.assertEqual(len(result["clean_results"]), 1)
        self.assertEqual(result["clean_results"][0]["id"], "auto_0")
        self.assertEqual(result["clean_results"][0]["amount_cents"], 0)
        self.assertEqual(result["clean_results"][0]["invoice_numbers"], [])

        # Not a list input
        result = process_reimbursements({"id": "r1", "amount_yuan": 10})
        self.assertEqual(len(result["clean_results"]), 1)
        self.assertEqual(result["clean_results"][0]["amount_cents"], 1000)

    def test_dirty_data_self_healing(self):
        records = [
            "not a dict",
            {"id": "r2", "amount_yuan": "1,234.56", "invoice_numbers": "INV_STRING"},
            {"id": "r3", "amount_yuan": "   ", "invoice_numbers": None},
            {"id": "r4", "amount_yuan": None, "invoice_numbers": {"not": "a list"}},
            {"id": "r5", "amount_yuan": 100, "invoice_numbers": ["INV01", None, "  ", 123]}
        ]
        result = process_reimbursements(records)
        self.assertEqual(len(result["clean_results"]), 5)

        # Record 0
        self.assertEqual(result["clean_results"][0]["amount_cents"], 0)
        self.assertTrue(any(trace["step"] == "record_type_fix" and trace["index"] == 0 for trace in result["audit_trace"]))

        # Record 1 (commas in amount, string in invoices)
        self.assertEqual(result["clean_results"][1]["amount_cents"], 123456)
        self.assertEqual(result["clean_results"][1]["invoice_numbers"], ["INV_STRING"])

        # Record 2 (empty string amount)
        self.assertEqual(result["clean_results"][2]["amount_cents"], 0)

        # Record 3 (None amount, dict invoices)
        self.assertEqual(result["clean_results"][3]["amount_cents"], 0)
        self.assertEqual(result["clean_results"][3]["invoice_numbers"], [])
        self.assertTrue(any(trace["step"] == "invoice_type_fix" and trace["id"] == "r4" for trace in result["audit_trace"]))

        # Record 4 (mixed invoices)
        self.assertEqual(result["clean_results"][4]["amount_cents"], 10000)
        self.assertEqual(result["clean_results"][4]["invoice_numbers"], ["INV01", "123"])

    def test_duplicate_invoices(self):
        records = [
            {"id": "r1", "amount_yuan": 10, "invoice_numbers": ["INV_A", "INV_B"]},
            {"id": "r2", "amount_yuan": 20, "invoice_numbers": ["INV_B", "INV_C"]},
            {"id": "r3", "amount_yuan": 30, "invoice_numbers": ["INV_A", "INV_D", "INV_A"]}
        ]
        result = process_reimbursements(records)

        self.assertEqual(result["clean_results"][0]["invoice_numbers"], ["INV_A", "INV_B"])
        self.assertEqual(result["clean_results"][1]["invoice_numbers"], ["INV_C"])
        self.assertEqual(result["clean_results"][2]["invoice_numbers"], ["INV_D"])

        self.assertEqual(result["total_unique_invoices"], 4)

        duplicate_traces = [t for t in result["audit_trace"] if t["step"] == "invoice_duplicate_removed"]
        self.assertEqual(len(duplicate_traces), 3) # INV_B in r2, INV_A in r3, INV_A (second) in r3

    def test_extreme_boundary_cases(self):
        # NaN, Infinity, extremely large numbers
        records = [
            {"id": "r1", "amount_yuan": float('inf')},
            {"id": "r2", "amount_yuan": float('-inf')},
            {"id": "r3", "amount_yuan": float('nan')},
            {"id": "r4", "amount_yuan": "not_a_number"},
            {"id": "r5", "amount_yuan": "999999999999999.99"}
        ]
        result = process_reimbursements(records)

        self.assertEqual(result["clean_results"][0]["amount_cents"], 0)
        self.assertEqual(result["clean_results"][1]["amount_cents"], 0)
        self.assertEqual(result["clean_results"][2]["amount_cents"], 0)
        self.assertEqual(result["clean_results"][3]["amount_cents"], 0)
        self.assertEqual(result["clean_results"][4]["amount_cents"], 99999999999999999)

        fallback_traces = [t for t in result["audit_trace"] if t["step"] == "amount_conversion_fallback"]
        self.assertEqual(len(fallback_traces), 4)

if __name__ == '__main__':
    unittest.main()
