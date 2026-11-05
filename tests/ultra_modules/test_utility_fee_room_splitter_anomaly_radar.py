import unittest
from ultra_modules.utility_fee_room_splitter_anomaly_radar import calculate_fee_splits_and_scan

class TestUtilityFeeRoomSplitterAnomalyRadar(unittest.TestCase):

    def test_normal_splitting(self):
        room_data = [
            {'name': 'Alice', 'days': 30},
            {'name': 'Bob', 'days': 30},
            {'name': 'Charlie', 'days': 15}
        ]
        # Total days = 75, fee = 150 -> Alice: 60, Bob: 60, Charlie: 30
        results = calculate_fee_splits_and_scan(room_data, 150.0)
        self.assertEqual(len(results), 3)

        alice = next(r for r in results if r['name'] == 'Alice')
        charlie = next(r for r in results if r['name'] == 'Charlie')

        self.assertAlmostEqual(alice['fee'], 60.0)
        self.assertAlmostEqual(charlie['fee'], 30.0)

        for r in results:
            self.assertEqual(r['tag'], 'GREEN')

    def test_dirty_data_auto_healing(self):
        room_data = [
            {'name': 'Alice', 'days': '30'},
            {'name': 'Bob', 'days': 'not a number'},
            {'name': 'Charlie', 'days': -10},
            {'name': 123, 'days': None}
        ]
        # Cleaned: Alice: 30, Bob: 0, Charlie: 0, '123': 0 -> Total days: 30
        # Fee '100.5' -> 100.5
        results = calculate_fee_splits_and_scan(room_data, '100.5')

        self.assertEqual(len(results), 4)

        alice = next(r for r in results if r['name'] == 'Alice')
        bob = next(r for r in results if r['name'] == 'Bob')
        charlie = next(r for r in results if r['name'] == 'Charlie')
        num = next(r for r in results if r['name'] == '123')

        self.assertAlmostEqual(alice['fee'], 100.5)
        self.assertAlmostEqual(bob['fee'], 0.0)
        self.assertAlmostEqual(charlie['fee'], 0.0)
        self.assertAlmostEqual(num['fee'], 0.0)

        for r in results:
            self.assertEqual(r['tag'], 'GREEN')

    def test_missing_parameter_defaults(self):
        # Missing total_fee defaults to 0.0
        results = calculate_fee_splits_and_scan([{'name': 'A', 'days': 10}], None)
        self.assertEqual(results[0]['fee'], 0.0)

        # Missing days entirely
        results = calculate_fee_splits_and_scan([{'name': 'A'}], 50)
        self.assertEqual(results[0]['fee'], 50.0) # Split equally since total_days=0

        # Not a list
        results = calculate_fee_splits_and_scan(None, 100)
        self.assertEqual(results, [])

    def test_extreme_bounds_zero_days(self):
        room_data = [
            {'name': 'A', 'days': 0},
            {'name': 'B', 'days': 0}
        ]
        results = calculate_fee_splits_and_scan(room_data, 100)
        self.assertAlmostEqual(results[0]['fee'], 50.0)
        self.assertAlmostEqual(results[1]['fee'], 50.0)
        self.assertEqual(results[0]['tag'], 'GREEN')

    def test_anomaly_highlights(self):
        # Generate 40 data points to trigger Top 3% check
        # Normal fee = 10, total ~ 400
        # One anomaly with days = 1000
        room_data = [{'name': f'P{i}', 'days': 10} for i in range(39)]
        room_data.append({'name': 'Anomaly', 'days': 1000})

        # Total days = 390 + 1000 = 1390
        # Let's say total fee is 13900 -> Normal get ~100, Anomaly gets ~10000
        results = calculate_fee_splits_and_scan(room_data, 13900)

        anomaly = next(r for r in results if r['name'] == 'Anomaly')
        self.assertEqual(anomaly['tag'], 'RED')
        self.assertTrue('异常' in anomaly['reason'])

        normal_count = sum(1 for r in results if r['tag'] == 'GREEN')
        self.assertGreater(normal_count, 35) # Majority are green
