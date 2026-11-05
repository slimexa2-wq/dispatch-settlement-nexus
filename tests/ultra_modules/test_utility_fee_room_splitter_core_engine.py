import unittest
from ultra_modules.utility_fee_room_splitter_core_engine import split_utility_fee

class TestUtilityFeeRoomSplitterCoreEngine(unittest.TestCase):
    def test_normal_operation(self):
        """1. Normal operation (standard fee and days)."""
        residents = [
            {'name': 'Alice', 'days': 10},
            {'name': 'Bob', 'days': 20}
        ]
        result = split_utility_fee(300.0, residents)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['fee'], 100.0)
        self.assertEqual(result[1]['fee'], 200.0)

    def test_dirty_data_self_healing(self):
        """2. Dirty data self-healing (invalid types for fee and days)."""
        residents = [
            {'name': 'Charlie', 'days': 'invalid'},
            {'name': 'Dave', 'days': None},
            {'name': 'Eve', 'days': -5}
        ]
        result = split_utility_fee("300", residents)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['days'], 1)
        self.assertEqual(result[1]['days'], 1)
        self.assertEqual(result[2]['days'], 1)
        self.assertEqual(result[0]['fee'], 100.0)
        self.assertEqual(result[1]['fee'], 100.0)
        self.assertEqual(result[2]['fee'], 100.0)

    def test_missing_parameters_fallback(self):
        """3. Missing parameters fallback (empty lists, missing fields)."""
        result_empty_total = split_utility_fee("abc", [{'name': 'A', 'days': 1}])
        self.assertEqual(result_empty_total[0]['fee'], 0.0)

        result_negative_total = split_utility_fee(-100.0, [{'name': 'A', 'days': 1}])
        self.assertEqual(result_negative_total[0]['fee'], 0.0)

        result_nan_total = split_utility_fee(float('nan'), [{'name': 'A', 'days': 1}])
        self.assertEqual(result_nan_total[0]['fee'], 0.0)

        result_empty = split_utility_fee(None, [])
        self.assertEqual(result_empty, [])

        residents = [
            {'days': 5},
            {'name': 'Frank'}
        ]
        result = split_utility_fee(100.0, residents)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['name'], 'unknown')
        self.assertEqual(result[0]['days'], 5)
        self.assertEqual(result[1]['name'], 'Frank')
        self.assertEqual(result[1]['days'], 1)

        self.assertEqual(result[0]['fee'], 83.33)
        self.assertEqual(result[1]['fee'], 16.67)

    def test_extreme_boundaries(self):
        """4. Extreme boundaries (zero total fee, zero days, handling of rounding remainders)."""
        residents = [{'name': 'G', 'days': 10}, {'name': 'H', 'days': 10}]
        result_zero_fee = split_utility_fee(0, residents)
        self.assertEqual(result_zero_fee[0]['fee'], 0.0)
        self.assertEqual(result_zero_fee[1]['fee'], 0.0)

        residents_zero_days = [{'name': 'I', 'days': 0}, {'name': 'J', 'days': 0}, {'name': 'K', 'days': 0}]
        result_zero_days = split_utility_fee(100.0, residents_zero_days)
        self.assertEqual(result_zero_days[0]['fee'], 33.34)
        self.assertEqual(result_zero_days[1]['fee'], 33.33)
        self.assertEqual(result_zero_days[2]['fee'], 33.33)
        self.assertAlmostEqual(sum(r['fee'] for r in result_zero_days), 100.0)

        residents_remainders = [
            {'name': 'L', 'days': 1},
            {'name': 'M', 'days': 1},
            {'name': 'N', 'days': 1}
        ]
        result_remainders = split_utility_fee(100.0, residents_remainders)
        self.assertEqual(result_remainders[0]['fee'], 33.34)
        self.assertEqual(result_remainders[1]['fee'], 33.33)
        self.assertEqual(result_remainders[2]['fee'], 33.33)
        self.assertAlmostEqual(sum(r['fee'] for r in result_remainders), 100.0)

    def test_complete_self_healing(self):
        """5. Complete self-healing with totally unexpected structures (e.g. None for lists)."""
        result_none_residents = split_utility_fee(100.0, None)
        self.assertEqual(result_none_residents, [])

        result_dict_residents = split_utility_fee(100.0, {"name": "O", "days": 5})
        self.assertEqual(result_dict_residents, [])

        residents = [
            "Just a string",
            123,
            {'name': 'P', 'days': 10},
            None
        ]
        result = split_utility_fee(100.0, residents)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'P')
        self.assertEqual(result[0]['days'], 10)
        self.assertEqual(result[0]['fee'], 100.0)

if __name__ == '__main__':
    unittest.main()
