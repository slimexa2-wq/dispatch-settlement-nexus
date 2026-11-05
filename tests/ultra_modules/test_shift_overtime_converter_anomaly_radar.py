import unittest
import math
from ultra_modules.shift_overtime_converter_anomaly_radar import ShiftOvertimeConverterAnomalyRadar

class TestShiftOvertimeConverterAnomalyRadar(unittest.TestCase):
    def setUp(self):
        self.radar = ShiftOvertimeConverterAnomalyRadar()

    def test_normal_operation(self):
        # Expected inputs
        records = [
            {'regular_overtime': 2.0, 'weekend_overtime': 4.0, 'holiday_overtime': 0.0},
            {'regular_overtime': 3.0, 'weekend_overtime': 2.0, 'holiday_overtime': 0.0},
            {'regular_overtime': 1.0, 'weekend_overtime': 1.0, 'holiday_overtime': 1.0},
        ]
        result = self.radar.process(records)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0]['equivalent_hours'], 2.0 * 1.5 + 4.0 * 2.0)
        self.assertEqual(result[1]['equivalent_hours'], 3.0 * 1.5 + 2.0 * 2.0)
        self.assertEqual(result[2]['equivalent_hours'], 1.0 * 1.5 + 1.0 * 2.0 + 1.0 * 3.0)

        # All below threshold_3_percent because z_score must be > 0
        # Well, there's always a top element. Here the top is index 0: 11.0.
        # Mean is (11 + 8.5 + 6.5) / 3 = 26 / 3 = 8.66. Top > Mean, so z_score > 0.
        self.assertEqual(result[0]['status_color'], 'Red')
        self.assertEqual(result[0]['reason'], '工时过高，远超正常水平')

    def test_dirty_data_self_healing(self):
        records = [
            {'regular_overtime': -2.0, 'weekend_overtime': 'abc', 'holiday_overtime': None},
            {'regular_overtime': ' 2.0 ', 'weekend_overtime': math.nan, 'holiday_overtime': math.inf},
            {'regular_overtime': '-5.0', 'weekend_overtime': float('nan'), 'holiday_overtime': float('inf')}
        ]
        result = self.radar.process(records)
        self.assertEqual(result[0]['equivalent_hours'], 0.0) # all healed to 0
        self.assertEqual(result[1]['equivalent_hours'], 2.0 * 1.5) # regular healed to 2.0, rest 0
        self.assertEqual(result[2]['equivalent_hours'], 0.0) # all healed to 0

    def test_missing_parameter_fallbacks(self):
        records = [
            {}, # No params
            {'regular_overtime': 10}, # Only regular
            {'regular_overtime': []}, # List type should be 0.0
        ]
        result = self.radar.process(records)
        self.assertEqual(result[0]['equivalent_hours'], 0.0)
        self.assertEqual(result[1]['equivalent_hours'], 15.0)
        self.assertEqual(result[2]['equivalent_hours'], 0.0)

    def test_extreme_boundary_conditions(self):
        # Empty list
        self.assertEqual(self.radar.process([]), [])

        # Huge numbers
        records = [
            {'regular_overtime': 1e6, 'weekend_overtime': 1e6, 'holiday_overtime': 1e6},
            {'regular_overtime': 0, 'weekend_overtime': 0, 'holiday_overtime': 0},
        ]
        result = self.radar.process(records)
        self.assertEqual(result[0]['equivalent_hours'], 1.5e6 + 2e6 + 3e6)
        self.assertEqual(result[0]['status_color'], 'Red')

    def test_top_3_percent_anomaly_detection(self):
        records = []
        for i in range(100):
            records.append({'regular_overtime': 1.0, 'weekend_overtime': 1.0, 'holiday_overtime': 0.0}) # 3.5

        # Add anomalies
        records[10] = {'regular_overtime': 100.0, 'weekend_overtime': 0.0, 'holiday_overtime': 0.0} # 150
        records[20] = {'regular_overtime': 90.0, 'weekend_overtime': 0.0, 'holiday_overtime': 0.0} # 135
        records[30] = {'regular_overtime': 80.0, 'weekend_overtime': 0.0, 'holiday_overtime': 0.0} # 120
        # Add 7 elements to cover top 10% condition
        for i in range(40, 47):
            records[i] = {'regular_overtime': 50.0, 'weekend_overtime': 0.0, 'holiday_overtime': 0.0}

        result = self.radar.process(records)

        # 100 elements. top 3% is 3 elements.
        red_count = sum(1 for r in result if r['status_color'] == 'Red')
        self.assertEqual(red_count, 3)

        self.assertEqual(result[10]['status_color'], 'Red')
        self.assertEqual(result[20]['status_color'], 'Red')
        self.assertEqual(result[30]['status_color'], 'Red')

        yellow_count = sum(1 for r in result if r['status_color'] == 'Yellow')
        self.assertEqual(yellow_count, 7)

        # We specified top 10% for Yellow/Green threshold, but then marked remaining as Green/Yellow based on rank.
        # Let's ensure the regular ones are Green.
        self.assertEqual(result[0]['status_color'], 'Green')

if __name__ == '__main__':
    unittest.main()
