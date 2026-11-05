import unittest
from ultra_modules.tiered_rebate_calculator_anomaly_radar import RebateAnomalyRadar

class TestRebateAnomalyRadar(unittest.TestCase):
    def setUp(self):
        self.radar = RebateAnomalyRadar()

    def test_init_with_custom_tiers(self):
        radar = RebateAnomalyRadar(tiers={7: 600.0})
        self.assertEqual(radar.tiers[7], 600.0)

    def test_normal_case_green(self):
        records = [
            {"worker_id": "W001", "days_worked": 7, "absent_days": 0},
            {"worker_id": "W002", "days_worked": 15, "absent_days": 1},
            {"worker_id": "W003", "days_worked": 30, "absent_days": 2},
            {"worker_id": "W004", "days_worked": 45, "absent_days": 0},
        ]
        processed = self.radar.process_records(records)

        # Verify first item (W001) - 7 days, 500 rebate
        self.assertEqual(processed[0]["status_color"], "GREEN")
        self.assertEqual(processed[0]["base_rebate"], 500.0)
        self.assertEqual(processed[0]["deduction"], 0.0)
        self.assertEqual(processed[0]["final_rebate"], 500.0)

        # Verify second item (W002) - 15 days, 1500 rebate, 1 absent day (100 deduction)
        self.assertEqual(processed[1]["status_color"], "GREEN")
        self.assertEqual(processed[1]["base_rebate"], 1500.0)
        self.assertEqual(processed[1]["deduction"], 100.0)
        self.assertEqual(processed[1]["final_rebate"], 1400.0)

    def test_dirty_data_healing_yellow(self):
        records = [
            # Negative days worked
            {"worker_id": "W101", "days_worked": -5, "absent_days": 0},
            # Negative absent days
            {"worker_id": "W102", "days_worked": 10, "absent_days": -2},
            # Absent days > days worked
            {"worker_id": "W103", "days_worked": 5, "absent_days": 10},
        ]
        processed = self.radar.process_records(records)

        self.assertEqual(processed[0]["status_color"], "YELLOW")
        self.assertEqual(processed[0]["days_worked"], 0.0)

        self.assertEqual(processed[1]["status_color"], "YELLOW")
        self.assertEqual(processed[1]["absent_days"], 0.0)

        # This one gets marked RED because it's the top anomaly out of 3 records
        self.assertEqual(processed[2]["status_color"], "RED")
        self.assertTrue("已自动截断" in processed[2]["reason"])
        self.assertEqual(processed[2]["absent_days"], 5.0)  # Capped at days_worked

    def test_missing_parameter_fallback(self):
        records = [
            # Missing worker_id, days_worked, absent_days
            {},
            # Missing days_worked and absent_days but has worker_id
            {"worker_id": "W201"},
            # Invalid types
            {"worker_id": "W202", "days_worked": "invalid", "absent_days": None},
        ]
        processed = self.radar.process_records(records)

        self.assertEqual(processed[0]["status_color"], "YELLOW")
        self.assertTrue(processed[0]["worker_id"].startswith("AUTO-"))
        self.assertEqual(processed[0]["days_worked"], 0.0)
        self.assertEqual(processed[0]["absent_days"], 0.0)

        self.assertEqual(processed[1]["status_color"], "YELLOW")
        self.assertEqual(processed[1]["worker_id"], "W201")
        self.assertEqual(processed[1]["days_worked"], 0.0)
        self.assertEqual(processed[1]["absent_days"], 0.0)

        self.assertEqual(processed[2]["status_color"], "YELLOW")
        self.assertEqual(processed[2]["days_worked"], 0.0)
        self.assertEqual(processed[2]["absent_days"], 0.0)

    def test_extreme_boundary_cases(self):
        records = [
            # Extremely high absent days causing negative rebate -> should cap at 0
            {"worker_id": "W301", "days_worked": 10, "absent_days": 10},
            # Empty list
        ]
        processed = self.radar.process_records(records)

        # Base rebate for 10 days is 500 (from 7 days tier)
        # Deduction is 10 * 100 = 1000
        # Final rebate should be max(0, 500 - 1000) = 0
        self.assertEqual(processed[0]["base_rebate"], 500.0)
        self.assertEqual(processed[0]["deduction"], 1000.0)
        self.assertEqual(processed[0]["final_rebate"], 0.0)
        self.assertEqual(processed[0]["status_color"], "GREEN")

        # Empty list check
        empty_processed = self.radar.process_records([])
        self.assertEqual(len(empty_processed), 0)

    def test_anomaly_detection_red(self):
        # We need enough records to make 3% meaningful.
        # Let's create 100 records.
        records = []
        for i in range(97):
            records.append({"worker_id": f"W_{i}", "days_worked": 30, "absent_days": 0})

        # Top 3 anomalous items
        records.append({"worker_id": "A_1", "days_worked": 30, "absent_days": 10})
        records.append({"worker_id": "A_2", "days_worked": 30, "absent_days": 15})
        records.append({"worker_id": "A_3", "days_worked": 30, "absent_days": 20})

        processed = self.radar.process_records(records)

        red_count = 0
        green_count = 0

        for r in processed:
            if r["status_color"] == "RED":
                red_count += 1
                self.assertTrue("【需人工关注】" in r["reason"])
            elif r["status_color"] == "GREEN":
                green_count += 1

        # 3% of 100 is 3 records
        self.assertEqual(red_count, 3)
        self.assertEqual(green_count, 97)

if __name__ == '__main__':
    unittest.main()
