import unittest
from ultra_modules.ClientBillSummaryGenerator_core_engine import generate_client_bill_summary

class TestClientBillSummaryGenerator(unittest.TestCase):
    def test_normal_data(self):
        """Test with valid and expected data formats."""
        data = [
            {'hours': 10, 'rate': 100},
            {'hours': 5, 'rate': 150}
        ]
        defaults = {'management_fee_rate': 0.1, 'tax_rate': 0.05}
        result = generate_client_bill_summary(data, defaults)

        self.assertEqual(result['total_hours'], 15.0)
        self.assertEqual(result['total_base_cost'], 1750.0)
        self.assertEqual(result['management_fee'], 175.0)  # 1750 * 0.1
        self.assertEqual(result['subtotal'], 1925.0)
        self.assertEqual(result['tax'], 96.25)  # 1925 * 0.05
        self.assertEqual(result['grand_total'], 2021.25)
        self.assertEqual(result['entry_count'], 2)

    def test_missing_parameter_defaults(self):
        """Test with no data and no defaults passed."""
        result = generate_client_bill_summary()
        self.assertEqual(result['total_hours'], 0.0)
        self.assertEqual(result['total_base_cost'], 0.0)
        self.assertEqual(result['management_fee_rate'], 0.05) # Default 5%
        self.assertEqual(result['tax_rate'], 0.06) # Default 6%
        self.assertEqual(result['grand_total'], 0.0)
        self.assertEqual(result['entry_count'], 0)

    def test_dirty_data_self_healing(self):
        """Test with dirty data like invalid strings, missing fields, and nan."""
        data = [
            {'hours': 'invalid_string', 'rate': 100},  # invalid hours
            {'hours': 10, 'rate': None},  # invalid rate
            {'hours': -5, 'rate': 100},   # negative hours
            {'hours': float('nan'), 'rate': 100}, # nan hours
            'this is not a dictionary' # invalid item type
        ]
        defaults = {'hourly_rate': 50.0}
        result = generate_client_bill_summary(data, defaults)

        # 'invalid_string' -> 0 hours
        # 'rate' None -> default hourly_rate 50
        # -5 hours -> 0 hours
        # nan hours -> 0 hours
        # 'this is not a dictionary' -> ignored

        self.assertEqual(result['total_hours'], 10.0)
        self.assertEqual(result['total_base_cost'], 500.0) # 10 * 50
        self.assertEqual(result['entry_count'], 4)

    def test_extreme_boundaries(self):
        """Test with very large values and zero values."""
        data = [
            {'hours': 1000000.5, 'rate': 9999.99},
            {'hours': 0, 'rate': 0}
        ]
        result = generate_client_bill_summary(data)

        self.assertEqual(result['total_hours'], 1000000.5)
        self.assertEqual(result['total_base_cost'], 9999994999.99) # 1000000.5 * 9999.99
        self.assertEqual(result['entry_count'], 2)

    def test_partial_missing_fields(self):
        """Test when only some fields are present and ensure proper cleaning."""
        data = [
            {'hours': 5},  # missing rate
            {'rate': 200}, # missing hours
            {} # missing both
        ]
        defaults = {'hourly_rate': 25.0}
        result = generate_client_bill_summary(data, defaults)

        # item 1: hours=5, rate=25
        # item 2: hours=0, rate=200
        # item 3: hours=0, rate=25
        self.assertEqual(result['total_hours'], 5.0)
        self.assertEqual(result['total_base_cost'], 125.0)
        self.assertEqual(result['entry_count'], 3)
        self.assertEqual(result['clean_data'][0]['rate'], 25.0)
        self.assertEqual(result['clean_data'][1]['hours'], 0.0)
        self.assertEqual(result['clean_data'][1]['rate'], 200.0)

if __name__ == '__main__':
    unittest.main()
