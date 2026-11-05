import json
import argparse
import sys
import csv
from io import StringIO
from typing import Dict, Any, List

class ResignedWorkerPayHoldNexus:
    def __init__(self, compliance_cap_ratio: float = 0.2):
        # 默认扣款合规上限比例：如 20%
        self.compliance_cap_ratio = compliance_cap_ratio

    def _clean_data(self, worker_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        数据自愈：处理缺失数据，转换数据类型，保障鲁棒性
        """
        cleaned = worker_data.copy()

        # 缺参自动兜底处理
        if 'base_salary' not in cleaned or cleaned['base_salary'] is None:
            cleaned['base_salary'] = 0.0

        if 'proposed_deduction' not in cleaned or cleaned['proposed_deduction'] is None:
            cleaned['proposed_deduction'] = 0.0

        if 'worker_id' not in cleaned or cleaned['worker_id'] is None:
            cleaned['worker_id'] = 'UNKNOWN_ID'

        if 'name' not in cleaned or cleaned['name'] is None:
            cleaned['name'] = 'Unknown Worker'

        # 脏数据转数值类型，无法转换则取 0.0
        try:
            cleaned['base_salary'] = float(cleaned['base_salary'])
        except (ValueError, TypeError):
            cleaned['base_salary'] = 0.0

        try:
            cleaned['proposed_deduction'] = float(cleaned['proposed_deduction'])
        except (ValueError, TypeError):
            cleaned['proposed_deduction'] = 0.0

        # 防止负数的基础薪资和提议扣款
        cleaned['base_salary'] = max(0.0, cleaned['base_salary'])
        cleaned['proposed_deduction'] = max(0.0, cleaned['proposed_deduction'])

        return cleaned

    def process_worker(self, worker_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        核心对账及扣款合规上限校验逻辑
        """
        data = self._clean_data(worker_data)

        base_salary = data['base_salary']
        proposed_deduction = data['proposed_deduction']

        # 计算合规上限扣款
        max_allowed_deduction = base_salary * self.compliance_cap_ratio

        # 实际扣款不能超过提议扣款和合规上限扣款中的较小值
        actual_deduction = min(proposed_deduction, max_allowed_deduction)

        # 待发薪资
        final_payable_salary = base_salary - actual_deduction

        # 返回对账及处理结果
        return {
            "worker_id": data['worker_id'],
            "name": data['name'],
            "base_salary": round(base_salary, 2),
            "proposed_deduction": round(proposed_deduction, 2),
            "max_allowed_deduction": round(max_allowed_deduction, 2),
            "actual_deduction": round(actual_deduction, 2),
            "final_payable_salary": round(final_payable_salary, 2),
            "status": "COMPLIANT" if proposed_deduction <= max_allowed_deduction else "ADJUSTED_TO_CAP"
        }

    def process_batch(self, batch_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [self.process_worker(worker) for worker in batch_data]

class ResultAdapter:
    @staticmethod
    def to_json(results: List[Dict[str, Any]]) -> str:
        return json.dumps(results, ensure_ascii=False, indent=2)

    @staticmethod
    def to_csv_excel(results: List[Dict[str, Any]]) -> str:
        if not results:
            return ""

        output = StringIO()
        # Excel通常接受CSV格式的数据
        writer = csv.DictWriter(output, fieldnames=results[0].keys())
        writer.writeheader()
        writer.writerows(results)
        return output.getvalue()


def run_cli_one_click():
    """
    一键运行CLI入口。
    提供无参调用的极简体验，默认内置测试数据进行演示。
    """
    parser = argparse.ArgumentParser(description="自离/旷工离职人员急辞扣款合规上限校验与待发薪资自动对账器")
    parser.add_argument('--format', choices=['json', 'excel'], default='json',
                        help='输出格式 (默认: json, 可选: excel 即 csv 格式)')
    parser.add_argument('--data', type=str, help='输入数据的JSON字符串')

    args = parser.parse_args()

    # 默认兜底：如果没有提供数据参数，使用内置默认数据
    if args.data:
        try:
            input_data = json.loads(args.data)
            if isinstance(input_data, dict):
                input_data = [input_data]
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON input data."}))
            sys.exit(1)
    else:
        # 默认运行的数据，包含正常和脏数据/缺参情况
        input_data = [
            {"worker_id": "W001", "name": "Alice", "base_salary": 10000, "proposed_deduction": 1000},  # 正常，不超限
            {"worker_id": "W002", "name": "Bob", "base_salary": 10000, "proposed_deduction": 3000},    # 超限，需被调整到合规上限(20%)
            {"worker_id": "W003", "base_salary": "invalid", "proposed_deduction": None},                # 缺参及脏数据
            {}  # 极端空数据
        ]

    nexus = ResignedWorkerPayHoldNexus()
    results = nexus.process_batch(input_data)

    if args.format == 'excel':
        output = ResultAdapter.to_csv_excel(results)
    else:
        output = ResultAdapter.to_json(results)

    print(output)

if __name__ == '__main__':
    run_cli_one_click()
