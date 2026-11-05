import unittest
import json
from ultra_modules.BankBatchTransferFormatter_cli_one_click import (
    luhn_checksum,
    clean_data,
    process_records,
    to_csv_string,
    run,
    main
)
import sys
import io

class TestBankBatchTransferFormatterCliOneClick(unittest.TestCase):

    def test_luhn_checksum_normal_and_edge_cases(self):
        # Normal correct cards (test numbers)
        self.assertTrue(luhn_checksum("79927398713")) # Example known valid luhn
        self.assertFalse(luhn_checksum("79927398714")) # Invalid

        # Edge cases and dirty data
        self.assertFalse(luhn_checksum(""))
        self.assertFalse(luhn_checksum(None))
        self.assertFalse(luhn_checksum("abcd")) # No digits

    def test_clean_data_dirty_and_missing(self):
        self.assertEqual(clean_data("5000"), 5000.0)
        self.assertEqual(clean_data(" 5000.50 "), 5000.5)
        self.assertEqual(clean_data("￥6,000.00"), 6000.0)
        self.assertEqual(clean_data("$100"), 100.0)
        self.assertEqual(clean_data(None), 0.0)
        self.assertEqual(clean_data("invalid_amount"), 0.0)
        self.assertEqual(clean_data({}), 0.0) # Wrong type

    def test_process_records_defaults_and_formatting(self):
        records = [
            {"name": "Alice", "card_number": "79927398713", "amount": "1000", "bank_name": "招行深圳分行"},
            {"name": "Bob", "card_number": "", "bank_name": "工行"},
            {"amount": "￥200"}
        ]
        processed = process_records(records)

        self.assertEqual(len(processed), 3)
        # Alice is valid
        self.assertEqual(processed[0]["bank"], "CMB")
        self.assertTrue(processed[0]["card_valid"])
        self.assertEqual(processed[0]["status"], "READY")
        self.assertEqual(processed[0]["amount"], 1000.0)

        # Bob missing card/amount
        self.assertEqual(processed[1]["bank"], "ICBC")
        self.assertFalse(processed[1]["card_valid"])
        self.assertEqual(processed[1]["status"], "ERROR")
        self.assertEqual(processed[1]["amount"], 0.0)

        # Third missing all but amount
        self.assertEqual(processed[2]["name"], "")
        self.assertEqual(processed[2]["bank"], "UNKNOWN")
        self.assertEqual(processed[2]["amount"], 200.0)

    def test_run_zero_parameter_default(self):
        # Run with no arguments should process default records and output JSON
        result = run()
        data = json.loads(result)
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 4) # Default data has 4 records

        # Verify first default record
        self.assertEqual(data[0]["name"], "张三")
        self.assertEqual(data[0]["amount"], 5000.0)

    def test_run_with_input_and_csv_format(self):
        input_json = json.dumps([{"name": "Charlie", "card_number": "79927398713", "amount": "3000", "bank_name": "建行"}])

        # Test JSON parsing
        result_json = run(input_data=input_json)
        data = json.loads(result_json)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["bank"], "CCB")

        # Test CSV output
        result_csv = run(input_data=input_json, output_format="csv")
        self.assertIn("name,card_number,amount,bank,card_valid,status", result_csv)
        self.assertIn("Charlie,79927398713,3000.0,CCB,True,READY", result_csv)

    def test_run_with_invalid_json_fallback(self):
        # Test self-healing fallback when invalid json is provided
        result = run(input_data="{invalid_json}", input_format="json")
        data = json.loads(result)
        # Should fallback to default data
        self.assertEqual(len(data), 4)

    def test_run_with_csv_input(self):
        csv_input = "name,card_number,amount,bank_name\nDavid,79927398713,4000,ICBC\n"
        result = run(input_data=csv_input, input_format="csv")
        data = json.loads(result)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "David")
        self.assertEqual(data[0]["bank"], "ICBC")

    def test_coverage_gap_cases(self):
        # Line 59: Pass case in filtering
        processed = process_records([{"bank_name": "其他银行"}], bank="CMB")

        # Line 87: Empty records to to_csv_string
        self.assertEqual(to_csv_string([]), "")

        # Line 115-116: Dict parsing in run input
        input_json_dict = json.dumps({"name": "Eve", "card_number": "79927398713", "amount": "8000", "bank_name": "CMB"})
        res = run(input_data=input_json_dict)
        data = json.loads(res)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Eve")

    def test_cli_main(self):
        # Test the main CLI function with monkeypatching sys.argv and stdout
        import sys
        from unittest.mock import patch

        test_args = ["BankBatchTransferFormatter_cli_one_click.py", "--in-fmt", "json"]
        with patch.object(sys, 'argv', test_args):
            with patch('sys.stdout', new=io.StringIO()) as fake_out:
                main()
                output = fake_out.getvalue()

        data = json.loads(output)
        self.assertEqual(len(data), 4)

    def test_main_block(self):
        # coverage for the 'if __name__ == "__main__":' block
        import runpy
        from unittest.mock import patch

        test_args = ["BankBatchTransferFormatter_cli_one_click.py", "--in-fmt", "json"]
        with patch('sys.argv', test_args):
            with patch('sys.stdout', new=io.StringIO()) as fake_out:
                runpy.run_module('ultra_modules.BankBatchTransferFormatter_cli_one_click', run_name='__main__')
                output = fake_out.getvalue()
                data = json.loads(output)
                self.assertEqual(len(data), 4)

if __name__ == '__main__':
    unittest.main()
