import unittest
import json
from decimal import Decimal
from ultra_modules.utility_fee_room_splitter_plain_explainer import generate_explanation_card

class TestUtilityFeeRoomSplitterPlainExplainer(unittest.TestCase):

    def test_normal_case(self):
        # 1. Normal case (basic fee splitting based on varied days).
        occupants = [
            {'name': 'Alice', 'days': 30},
            {'name': 'Bob', 'days': 15},
            {'name': 'Charlie', 'days': 15}
        ]
        result_json = generate_explanation_card(total_amount=120, occupants=occupants, format_type='json')
        data = json.loads(result_json)

        self.assertEqual(data['total_amount'], '120.00')
        self.assertEqual(data['total_days'], 60)

        fees = {item['name']: item['fee_str'] for item in data['details']}
        self.assertEqual(fees['Alice'], '60.00')
        self.assertEqual(fees['Bob'], '30.00')
        self.assertEqual(fees['Charlie'], '30.00')

    def test_zero_configuration_missing_params(self):
        # 2. Zero-configuration / Missing Params (empty lists, None values, missing days defaulted to 30).
        result_json = generate_explanation_card(format_type='json') # Everything None
        data = json.loads(result_json)
        self.assertEqual(data['total_amount'], '0.00')
        self.assertEqual(data['total_days'], 0)
        self.assertEqual(len(data['details']), 0)

        occupants = [
            {'name': 'OnlyName'}, # Missing days
            {'days': 10}, # Missing name
            {} # Missing both
        ]
        result_json_2 = generate_explanation_card(total_amount=100, occupants=occupants, format_type='json')
        data_2 = json.loads(result_json_2)

        self.assertEqual(data_2['total_amount'], '100.00')
        self.assertEqual(data_2['total_days'], 30 + 10 + 30) # Default to 30

        fees = {item['name']: item['days'] for item in data_2['details']}
        self.assertEqual(fees['OnlyName'], 30)
        self.assertEqual(data_2['details'][1]['name'], '未知人员')
        self.assertEqual(data_2['details'][1]['days'], 10)
        self.assertEqual(data_2['details'][2]['name'], '未知人员')
        self.assertEqual(data_2['details'][2]['days'], 30)

    def test_dirty_data_self_healing(self):
        # 3. Dirty Data Self-Healing (invalid string types, negative values converted to 0, bad numeric types).
        occupants = [
            {'name': '  BadName  ', 'days': '-5'}, # Negative days -> 0, whitespace name -> striped
            {'name': '', 'days': 'not a number'}, # Empty name -> 未知人员, bad days -> 30
            'invalid item type', # Should be ignored
            {'name': None, 'days': []} # None name -> 未知人员, bad days -> 30
        ]
        result_json = generate_explanation_card(total_amount='-100.5', occupants=occupants, format_type='json') # Negative amount -> 0.00
        data = json.loads(result_json)

        self.assertEqual(data['total_amount'], '0.00')

        self.assertEqual(len(data['details']), 3) # The string item is ignored
        self.assertEqual(data['details'][0]['name'], 'BadName')
        self.assertEqual(data['details'][0]['days'], 0)

        self.assertEqual(data['details'][1]['name'], '未知人员')
        self.assertEqual(data['details'][1]['days'], 30)

        self.assertEqual(data['details'][2]['name'], '未知人员')
        self.assertEqual(data['details'][2]['days'], 30)

    def test_precision_remainder_bounds(self):
        # 4. Precision & Remainder bounds (e.g. 100 split 3 ways must perfectly sum to 100.00).
        occupants = [
            {'name': 'A', 'days': 30},
            {'name': 'B', 'days': 30},
            {'name': 'C', 'days': 30}
        ]
        result_json = generate_explanation_card(total_amount=100, occupants=occupants, format_type='json')
        data = json.loads(result_json)

        # 100 / 3 = 33.333...
        # Expect two to get 33.33 and one to get 33.34
        fees = [Decimal(item['fee_str']) for item in data['details']]
        self.assertEqual(sum(fees), Decimal('100.00'))
        self.assertIn(Decimal('33.34'), fees)
        self.assertIn(Decimal('33.33'), fees)
        self.assertEqual(fees.count(Decimal('33.33')), 2)
        self.assertEqual(fees.count(Decimal('33.34')), 1)

        # Complex split
        occupants2 = [
            {'name': 'A', 'days': 1},
            {'name': 'B', 'days': 2},
            {'name': 'C', 'days': 3}
        ]
        # Total = 10, amounts = 10 * 1/6, 10 * 2/6, 10 * 3/6
        # A: 1.666... -> 1.66
        # B: 3.333... -> 3.33
        # C: 5.000... -> 5.00
        # Total base allocated = 9.99
        # Remaining penny (0.01) goes to A because it lost the most precision (0.0066... vs 0.0033... vs 0)
        result_json2 = generate_explanation_card(total_amount=10, occupants=occupants2, format_type='json')
        data2 = json.loads(result_json2)

        fee_map = {item['name']: item['fee_str'] for item in data2['details']}
        self.assertEqual(fee_map['A'], '1.67')
        self.assertEqual(fee_map['B'], '3.33')
        self.assertEqual(fee_map['C'], '5.00')
        self.assertEqual(sum(Decimal(v) for v in fee_map.values()), Decimal('10.00'))

    def test_extreme_bounds(self):
        # 5. Extreme bounds (total amount is 0, total days is 0).
        occupants = [
            {'name': 'A', 'days': 0},
            {'name': 'B', 'days': 0}
        ]
        result_json = generate_explanation_card(total_amount=100, occupants=occupants, format_type='json')
        data = json.loads(result_json)

        # Total days 0 means everyone gets 0
        self.assertEqual(data['total_days'], 0)
        for item in data['details']:
            self.assertEqual(item['fee_str'], '0.00')

        # Format tests
        occupants_fmt = [{'name': 'A', 'days': 30}]
        md = generate_explanation_card(total_amount=100, occupants=occupants_fmt, format_type='markdown')
        self.assertIn('| A | 30 天 | **100.00 元** |', md)

        html = generate_explanation_card(total_amount=100, occupants=occupants_fmt, format_type='html')
        self.assertIn('100.00 元</strong></td>', html)

if __name__ == '__main__':
    unittest.main()
