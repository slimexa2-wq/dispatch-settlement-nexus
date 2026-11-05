import unittest
from ultra_modules.utility_fee_room_splitter_audit_trace import split_utility_fee

class TestUtilityFeeRoomSplitterAuditTrace(unittest.TestCase):

    def test_normal_split(self):
        # 1. Normal split (valid residents and fee)
        total_fee = 100.00
        residents = [
            {"id": "A", "days_stayed": 10},
            {"id": "B", "days_stayed": 20},
            {"id": "C", "days_stayed": 20}
        ]

        result = split_utility_fee(total_fee, residents)
        net_results = result["net_results"]
        audit_trace = result["audit_trace"]

        self.assertEqual(len(net_results), 3)
        self.assertEqual(net_results[0]["fee"], "20.00")
        self.assertEqual(net_results[1]["fee"], "40.00")
        self.assertEqual(net_results[2]["fee"], "40.00")
        self.assertTrue(len(audit_trace) > 0)

    def test_dirty_data_self_healing(self):
        # 2. Dirty data self-healing
        total_fee = "invalid_fee"
        residents = [
            {"id": "A", "days_stayed": -5},
            {"id": "B", "days_stayed": "not_a_number"},
            "invalid_resident_dict"
        ]

        result = split_utility_fee(total_fee, residents)
        net_results = result["net_results"]
        audit_trace = result["audit_trace"]

        # total_fee defaults to 0, negative days default to 0, invalid string days default to 0
        self.assertEqual(len(net_results), 2)  # invalid dict is skipped
        self.assertEqual(net_results[0]["fee"], "0.00")
        self.assertEqual(net_results[1]["fee"], "0.00")

    def test_missing_parameters_fallback(self):
        # 3. Missing parameters fallback
        result = split_utility_fee()
        net_results = result["net_results"]
        self.assertEqual(len(net_results), 0)

        result2 = split_utility_fee(total_fee=-50)
        self.assertEqual(len(result2["net_results"]), 0)

    def test_extreme_boundary(self):
        # 4. Extreme boundary (1 cent split among many, rounding checks)
        total_fee = 0.01
        residents = [
            {"id": "A", "days_stayed": 1},
            {"id": "B", "days_stayed": 1},
            {"id": "C", "days_stayed": 1}
        ]

        result = split_utility_fee(total_fee, residents)
        net_results = result["net_results"]

        # First two will get 0.00 (round half up of 0.0033 is 0.00), last will get remainder 0.01
        self.assertEqual(net_results[0]["fee"], "0.00")
        self.assertEqual(net_results[1]["fee"], "0.00")
        self.assertEqual(net_results[2]["fee"], "0.01")

    def test_zero_days_stayed_non_zero_fee(self):
        # 5. All residents have 0 days stayed but non-zero fee
        total_fee = 30.00
        residents = [
            {"id": "A", "days_stayed": 0},
            {"id": "B", "days_stayed": 0},
            {"id": "C", "days_stayed": 0}
        ]

        result = split_utility_fee(total_fee, residents)
        net_results = result["net_results"]

        # Should split equally
        self.assertEqual(net_results[0]["fee"], "10.00")
        self.assertEqual(net_results[1]["fee"], "10.00")
        self.assertEqual(net_results[2]["fee"], "10.00")

    def test_no_valid_residents_non_zero_fee(self):
        # Extra test: fee > 0 but no valid residents
        total_fee = 50.00
        residents = ["invalid", 123]

        result = split_utility_fee(total_fee, residents)
        net_results = result["net_results"]

        self.assertEqual(len(net_results), 0)

if __name__ == '__main__':
    unittest.main()
