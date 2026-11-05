import unittest
import json
from ultra_modules.ResignedWorkerPayHold_cli_one_click import ResignedWorkerPayHoldNexus, ResultAdapter

class TestResignedWorkerPayHoldNexus(unittest.TestCase):
    def setUp(self):
        self.nexus = ResignedWorkerPayHoldNexus(compliance_cap_ratio=0.2)

    def test_normal_execution_compliant(self):
        """测试正常情况：提议扣款在合规上限内"""
        worker = {
            "worker_id": "T001",
            "name": "Tom",
            "base_salary": 10000,
            "proposed_deduction": 1500
        }
        result = self.nexus.process_worker(worker)
        self.assertEqual(result["actual_deduction"], 1500)
        self.assertEqual(result["final_payable_salary"], 8500)
        self.assertEqual(result["status"], "COMPLIANT")

    def test_normal_execution_adjusted(self):
        """测试正常情况：提议扣款超出合规上限(20%)，需要被调整"""
        worker = {
            "worker_id": "T002",
            "name": "Jerry",
            "base_salary": 10000,
            "proposed_deduction": 3000
        }
        result = self.nexus.process_worker(worker)
        # 上限 10000 * 0.2 = 2000
        self.assertEqual(result["actual_deduction"], 2000)
        self.assertEqual(result["final_payable_salary"], 8000)
        self.assertEqual(result["status"], "ADJUSTED_TO_CAP")

    def test_dirty_data_self_healing(self):
        """测试脏数据自愈功能：非数值转为0，防止负数等"""
        worker = {
            "worker_id": "T003",
            "name": "Spike",
            "base_salary": "invalid_salary",  # 无法转换为float
            "proposed_deduction": -500        # 负数扣款应该被重置为0
        }
        result = self.nexus.process_worker(worker)
        self.assertEqual(result["base_salary"], 0.0)
        self.assertEqual(result["actual_deduction"], 0.0)
        self.assertEqual(result["final_payable_salary"], 0.0)

    def test_missing_parameter_default_fallback(self):
        """测试缺参自动设合理默认值"""
        worker = {}  # 没有任何参数
        result = self.nexus.process_worker(worker)
        self.assertEqual(result["worker_id"], "UNKNOWN_ID")
        self.assertEqual(result["name"], "Unknown Worker")
        self.assertEqual(result["base_salary"], 0.0)
        self.assertEqual(result["proposed_deduction"], 0.0)

    def test_extreme_boundary_conditions(self):
        """测试极端边界条件：如薪资为0，扣款极大等情况"""
        worker = {
            "worker_id": "T005",
            "name": "Tyke",
            "base_salary": 0,
            "proposed_deduction": 999999
        }
        result = self.nexus.process_worker(worker)
        # 薪资为0，上限自然为0
        self.assertEqual(result["max_allowed_deduction"], 0)
        self.assertEqual(result["actual_deduction"], 0)
        self.assertEqual(result["final_payable_salary"], 0)

    def test_adapters(self):
        """测试 JSON 和 Excel/CSV 适配器"""
        results = [
            {
                "worker_id": "W001",
                "name": "Alice",
                "base_salary": 10000.0,
                "proposed_deduction": 1000.0,
                "max_allowed_deduction": 2000.0,
                "actual_deduction": 1000.0,
                "final_payable_salary": 9000.0,
                "status": "COMPLIANT"
            }
        ]
        json_output = ResultAdapter.to_json(results)
        parsed_json = json.loads(json_output)
        self.assertEqual(parsed_json[0]["name"], "Alice")

        csv_output = ResultAdapter.to_csv_excel(results)
        self.assertIn("Alice", csv_output)
        self.assertIn("worker_id", csv_output)

if __name__ == '__main__':
    unittest.main()
