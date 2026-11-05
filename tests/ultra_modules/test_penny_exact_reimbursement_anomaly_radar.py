import unittest
from ultra_modules.penny_exact_reimbursement_anomaly_radar import scan_reimbursements

class TestPennyExactReimbursementAnomalyRadar(unittest.TestCase):
    def test_normal_case_green(self):
        data = [
            {"amount": 10.50, "employee_id": "e1", "invoice_no": "1001"},
            {"amount": 11.00, "employee_id": "e2", "invoice_no": "1003"},
            {"amount": 12.25, "employee_id": "e3", "invoice_no": "1005"},
        ]
        result = scan_reimbursements(data)
        self.assertEqual(len(result), 3)
        for r in result:
            self.assertEqual(r["color"], "GREEN")
            self.assertEqual(r["reason"], "正常")

    def test_top_3_percent_anomaly_red(self):
        # Create 100 elements to easily test 97th percentile
        data = []
        for i in range(1, 101):
            data.append({"amount": i, "employee_id": f"e{i}", "invoice_no": f"{2000+i}"})

        result = scan_reimbursements(data)
        self.assertEqual(len(result), 100)

        red_count = 0
        green_count = 0
        for r in result:
            if r["color"] == "RED":
                red_count += 1
                self.assertIn("金额异常偏高(Top 3%)", r["reason"])
            else:
                green_count += 1

        # 100 elements: index 97.0 is the threshold. elements are 1..100.
        # sorted_cents = [100, 200, ..., 10000]
        # k = 99 * 0.97 = 96.03 -> threshold is between index 96 and 97 (97 and 98).
        # We expect a small number of REDs. About 3% -> 3 items.
        # 100 * 0.97 = 97. threshold ~ 97. Flag if >= threshold. 97, 98, 99, 100. That's 4 items.
        self.assertTrue(red_count > 0 and red_count <= 5)

    def test_duplicate_invoice_red_and_consecutive_yellow(self):
        data = [
            {"amount": 10.00, "employee_id": "e1", "invoice_no": "1001"},
            {"amount": 10.00, "employee_id": "e2", "invoice_no": "1001"}, # Duplicate RED
            {"amount": 10.00, "employee_id": "e3", "invoice_no": "2001"},
            {"amount": 10.00, "employee_id": "e3", "invoice_no": "2002"}, # Consecutive YELLOW
        ]
        result = scan_reimbursements(data)

        self.assertEqual(result[0]["color"], "RED")
        self.assertIn("发现重复发票号", result[0]["reason"])

        self.assertEqual(result[1]["color"], "RED")
        self.assertIn("发现重复发票号", result[1]["reason"])

        self.assertEqual(result[2]["color"], "YELLOW")
        self.assertIn("同一员工发票连号", result[2]["reason"])

        self.assertEqual(result[3]["color"], "YELLOW")
        self.assertIn("同一员工发票连号", result[3]["reason"])

    def test_dirty_data_self_healing(self):
        data = [
            {"amount": None, "employee_id": None}, # Missing amount and invoice
            {"amount": "invalid", "employee_id": "e2", "invoice_no": None},
            {"amount": "15.999", "employee_id": "e3", "invoice_no": 3001}, # Float parsing string
        ]
        result = scan_reimbursements(data)

        self.assertEqual(result[0]["cents"], 0)
        self.assertEqual(result[0]["invoice_no"], "")
        self.assertEqual(result[0]["employee_id"], "unknown")

        self.assertEqual(result[1]["cents"], 0)
        self.assertEqual(result[1]["invoice_no"], "")

        # 15.999 * 100 = 1599.9 -> 1600 (HALF_UP)
        self.assertEqual(result[2]["cents"], 1600)
        self.assertEqual(result[2]["invoice_no"], "3001")

    def test_extreme_edge_cases(self):
        # Empty list
        self.assertEqual(scan_reimbursements([]), [])
        self.assertEqual(scan_reimbursements(None), [])

        # Single element
        data_single = [{"amount": 100.0, "employee_id": "e1", "invoice_no": "100"}]
        result_single = scan_reimbursements(data_single)
        self.assertEqual(result_single[0]["color"], "GREEN")

        # All identical elements
        data_identical = [
            {"amount": 50, "employee_id": "e1", "invoice_no": "100"},
            {"amount": 50, "employee_id": "e2", "invoice_no": "101"},
            {"amount": 50, "employee_id": "e3", "invoice_no": "102"},
        ]
        result_ident = scan_reimbursements(data_identical)
        for r in result_ident:
            # Should be green because min == max, threshold should be inf
            self.assertEqual(r["color"], "GREEN")

if __name__ == '__main__':
    unittest.main()
