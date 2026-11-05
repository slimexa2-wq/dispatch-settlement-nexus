import unittest
from unittest.mock import patch
import time

from ultra_modules.utility_fee_room_splitter_self_healing_guard import UtilityFeeRoomSplitter

class TestUtilityFeeRoomSplitter(unittest.TestCase):
    def setUp(self):
        self.splitter = UtilityFeeRoomSplitter()

    def test_normal_case(self):
        """Test with valid total fee and normal list of tenants with days."""
        total_fee = 100.0
        tenants = [
            {'name': 'Alice', 'days': 10},
            {'name': 'Bob', 'days': 20},
            {'name': 'Charlie', 'days': 10}
        ]

        result = self.splitter.calculate_and_split(total_fee, tenants)

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['fee'], 25.0)
        self.assertEqual(result[1]['fee'], 50.0)
        self.assertEqual(result[2]['fee'], 25.0)
        self.assertEqual(sum(t['fee'] for t in result), 100.0)

    def test_dirty_data_self_healing(self):
        """Test with missing keys, negative numbers, and invalid types."""
        total_fee = "150.5" # String type
        tenants = [
            {'name': 'Alice', 'days': "10"}, # String days
            {'name': 'Bob', 'days': -5}, # Negative days
            {'name': 'Charlie', 'days': None}, # None days
            {'name': 'David'}, # Missing days
            {'days': 5}, # Missing name
            {'name': 123, 'days': [1,2,3]} # Invalid types
        ]

        result = self.splitter.calculate_and_split(total_fee, tenants)

        self.assertEqual(len(result), 6)

        # Valid days: Alice (10), Bob (0), Charlie (0), David (0), NoName (5), NumericName (0)
        # Total days: 15

        # Alice (10/15) of 150.5 -> ~100.33
        # NoName (5/15) of 150.5 -> ~50.17

        total_split = sum(t['fee'] for t in result)
        self.assertAlmostEqual(total_split, 150.5)

        # Specific fee checks
        alice = next(t for t in result if t['name'] == 'Alice')
        self.assertAlmostEqual(alice['fee'], 100.33)

        no_name = next(t for t in result if t['name'] == 'Unknown')
        self.assertAlmostEqual(no_name['fee'], 50.17)

        # Check others are 0
        bob = next(t for t in result if t['name'] == 'Bob')
        self.assertEqual(bob['fee'], 0.0)

    def test_missing_parameter_fallbacks(self):
        """Test with none or empty parameters."""
        result_empty = self.splitter.calculate_and_split()
        self.assertEqual(result_empty, [])

        result_no_tenants = self.splitter.calculate_and_split(100.0)
        self.assertEqual(result_no_tenants, [])

        result_none_tenants = self.splitter.calculate_and_split(100.0, None)
        self.assertEqual(result_none_tenants, [])

    def test_extreme_boundaries(self):
        """Test 0 days for everyone, non-list inputs for tenants, total_fee boolean/negative."""
        # 0 days for everyone -> falls back to equal split
        tenants_zero = [
            {'name': 'Alice', 'days': 0},
            {'name': 'Bob', 'days': 0},
            {'name': 'Charlie', 'days': 0}
        ]
        result_zero = self.splitter.calculate_and_split(100.0, tenants_zero)
        self.assertEqual(len(result_zero), 3)
        self.assertEqual(result_zero[0]['fee'], 33.33)
        self.assertEqual(result_zero[1]['fee'], 33.34)
        self.assertEqual(result_zero[2]['fee'], 33.33) # 33.33 + 33.34 + 33.33 = 100.0

        # Non-list inputs for tenants -> acts as empty list
        result_non_list = self.splitter.calculate_and_split(100.0, "not a list")
        self.assertEqual(result_non_list, [])

        # Total fee negative -> 0.0
        result_neg_fee = self.splitter.calculate_and_split(-50.0, [{'name': 'A', 'days': 1}])
        self.assertEqual(result_neg_fee[0]['fee'], 0.0)

        # Total fee bool -> 0.0
        result_bool_fee = self.splitter.calculate_and_split(True, [{'name': 'A', 'days': 1}])
        self.assertEqual(result_bool_fee[0]['fee'], 0.0)

    @patch('time.time')
    def test_snapshot_undo_mechanism(self, mock_time):
        """Test the undo mechanism within 5s and after 5s."""
        # Calculation 1 at t=0
        mock_time.return_value = 0.0
        self.splitter.calculate_and_split(100.0, [{'name': 'A', 'days': 10}])

        # Calculation 2 at t=2
        mock_time.return_value = 2.0
        self.splitter.calculate_and_split(200.0, [{'name': 'A', 'days': 10}])

        # Undo at t=4 (within 5s of Calculation 2)
        mock_time.return_value = 4.0
        result_undo_1 = self.splitter.undo()
        self.assertEqual(result_undo_1[0]['fee'], 100.0) # Reverted to calc 1

        # Calculation 3 at t=10
        mock_time.return_value = 10.0
        self.splitter.calculate_and_split(300.0, [{'name': 'A', 'days': 10}])

        # Undo at t=20 (after 5s of Calculation 3)
        mock_time.return_value = 20.0
        result_undo_2 = self.splitter.undo()
        self.assertEqual(result_undo_2[0]['fee'], 300.0) # Silent fail, stays at calc 3

        # Undo at t=21 (still after 5s of calc 3, just to be sure)
        mock_time.return_value = 21.0
        result_undo_3 = self.splitter.undo()
        self.assertEqual(result_undo_3[0]['fee'], 300.0)

if __name__ == '__main__':
    unittest.main()
