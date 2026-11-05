import unittest
from ultra_modules.utility_fee_room_splitter_batch_pipeline import UtilityFeeRoomSplitterBatchPipeline

class TestUtilityFeeRoomSplitterBatchPipeline(unittest.TestCase):

    def setUp(self):
        self.pipeline = UtilityFeeRoomSplitterBatchPipeline(default_stay_days=30)

    def test_normal_case_proportional_split(self):
        """测试正常情况：正确按比例分配，并处理精度"""
        room_data = {
            "room_id": "R101",
            "total_fee": 100.0,
            "residents": [
                {"resident_id": "A", "stay_days": 10},
                {"resident_id": "B", "stay_days": 20},
            ]
        }

        result = self.pipeline.calculate_room_fee(room_data)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["room_id"], "R101")
        self.assertEqual(result["total_fee"], 100.0)

        split = result["split_details"]
        self.assertEqual(len(split), 2)

        # 10 / 30 * 100 = 33.33
        self.assertEqual(split[0]["resident_id"], "A")
        self.assertEqual(split[0]["fee"], 33.33)

        # 20 / 30 * 100 = 66.67
        self.assertEqual(split[1]["resident_id"], "B")
        self.assertEqual(split[1]["fee"], 66.67)

    def test_missing_stay_days_fallback(self):
        """测试缺参兜底：缺失 stay_days 或非法时，自动使用默认值"""
        room_data = {
            "room_id": "R102",
            "total_fee": 90.0,
            "residents": [
                {"resident_id": "A"}, # 缺失 stay_days
                {"resident_id": "B", "stay_days": None}, # null
                {"resident_id": "C", "stay_days": "invalid"}, # 字符串
            ]
        }

        result = self.pipeline.calculate_room_fee(room_data)
        split = result["split_details"]

        self.assertEqual(len(split), 3)
        for r in split:
            self.assertEqual(r["stay_days"], 30) # 默认值
            self.assertEqual(r["fee"], 30.0)

    def test_dirty_data_self_healing(self):
        """测试脏数据自愈：处理各种异常类型的数据输入"""
        room_data = {
            "room_id": 103, # 应该是字符串
            "total_fee": "abc", # 应该是浮点数
            "residents": "not a list" # 应该是列表
        }

        result = self.pipeline.calculate_room_fee(room_data)
        self.assertEqual(result["total_fee"], 0.0)
        self.assertEqual(result["split_details"], [])

        room_data2 = {
            "room_id": "R104",
            "total_fee": "100.5", # 字符串数字
            "residents": [
                None,
                "string",
                {"resident_id": "A", "stay_days": -10} # 负数天数
            ]
        }
        result2 = self.pipeline.calculate_room_fee(room_data2)
        self.assertEqual(result2["total_fee"], 100.5)
        self.assertEqual(len(result2["split_details"]), 1)
        self.assertEqual(result2["split_details"][0]["stay_days"], 0) # 负数变0
        # If total days is 0, fee is zero for all to avoid divide by zero according to logic:
        # if total_stay_days == 0 or total_fee <= 0 or not processed_residents: return early
        # self.assertEqual(result2["split_details"][0]["fee"], 100.5)
        self.assertEqual(result2["split_details"][0]["fee"], 0.0) # 因为总天数为0，所以没人分摊费用，早期返回

    def test_extreme_boundaries(self):
        """测试极端边界：0天，0费用，空列表等"""
        # 0总天数
        data1 = {
            "room_id": "R201", "total_fee": 100.0,
            "residents": [{"resident_id": "A", "stay_days": 0}]
        }
        res1 = self.pipeline.calculate_room_fee(data1)
        self.assertEqual(res1["split_details"][0]["fee"], 0.0)

        # 0总费用
        data2 = {
            "room_id": "R202", "total_fee": 0.0,
            "residents": [{"resident_id": "A", "stay_days": 10}]
        }
        res2 = self.pipeline.calculate_room_fee(data2)
        self.assertEqual(res2["split_details"][0]["fee"], 0.0)

    def test_concurrency_batch_pipeline(self):
        """测试高并发批量流式处理性能及正确性"""
        batch_data = []
        for i in range(1000):
            batch_data.append({
                "room_id": f"R{i}",
                "total_fee": 100.0,
                "residents": [
                    {"resident_id": f"A{i}", "stay_days": 10},
                    {"resident_id": f"B{i}", "stay_days": 20},
                ]
            })

        results = self.pipeline.process_batch(batch_data, max_workers=20)

        self.assertEqual(len(results), 1000)

        # 验证结果正确性，结果是乱序的，转dict校验
        res_dict = {r["room_id"]: r for r in results}
        self.assertIn("R0", res_dict)
        self.assertIn("R999", res_dict)

        sample = res_dict["R500"]
        self.assertEqual(sample["total_fee"], 100.0)
        self.assertEqual(sample["split_details"][0]["fee"], 33.33)
        self.assertEqual(sample["split_details"][1]["fee"], 66.67)

if __name__ == "__main__":
    unittest.main()
