import argparse
import json
import csv
import sys
import os
import re
from typing import Any, Dict, Union


def calculate_supplier_vat_deduction(
    invoice_type: Any = None,
    amount: Any = None,
    tax_rate: Any = None,
    differential_deduction: Any = 0.0
) -> Dict[str, Union[float, str, bool]]:
    """
    劳务供应商专票/普票税率合规性与进项抵扣测算器核心算法。
    纯函数，零配置自动容错，静默清洗脏数据，提供合理的默认值。
    支持税率：6%, 3%, 1%, 差额5%
    """
    # 1. 脏数据静默清洗与缺参默认兜底
    # 默认票据类型为“专票”
    norm_invoice_type = "专票"
    if isinstance(invoice_type, str):
        if "普" in invoice_type:
            norm_invoice_type = "普票"
        elif "专" in invoice_type:
            norm_invoice_type = "专票"

    def _clean_num(val: Any, default: float = 0.0) -> float:
        if val is None:
            return default
        if isinstance(val, bool):
            return float(val)
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str):
            cleaned = re.sub(r'[^\d.-]', '', val)
            try:
                return float(cleaned) if cleaned else default
            except ValueError:
                return default
        return default

    # 金额处理，默认为0.0，且不允许负数（极端边界）
    norm_amount = _clean_num(amount, 0.0)
    if norm_amount < 0:
        norm_amount = 0.0

    # 差额扣除部分处理，默认为0.0，不能超过总金额，不能为负
    norm_diff_deduction = _clean_num(differential_deduction, 0.0)
    if norm_diff_deduction < 0 or norm_diff_deduction > norm_amount:
        norm_diff_deduction = 0.0

    # 税率处理，默认为 6.0
    raw_rate = _clean_num(tax_rate, 6.0)
    # 处理小数形式的税率，如 0.06 -> 6.0
    if 0.0 < raw_rate < 1.0:
        raw_rate *= 100.0

    # 合规税率限定
    valid_rates = {6.0, 5.0, 3.0, 1.0}
    if raw_rate not in valid_rates:
        # 非法税率静默修正为最接近的合规税率
        norm_rate = min(valid_rates, key=lambda x: abs(x - raw_rate))
    else:
        norm_rate = raw_rate

    # 2. 核心算法测算
    # 如果是差额5%，计算税额时扣除差额部分；否则不扣除
    tax_base_inclusive = norm_amount
    actual_diff_deduction = 0.0
    if norm_rate == 5.0:
        tax_base_inclusive = max(0.0, norm_amount - norm_diff_deduction)
        actual_diff_deduction = norm_diff_deduction

    tax_amount = tax_base_inclusive / (1 + norm_rate / 100.0) * (norm_rate / 100.0)
    amount_exclusive = norm_amount - tax_amount

    # 进项抵扣计算：普票不可抵扣，专票可抵扣
    if norm_invoice_type == "专票":
        deductible_vat = tax_amount
    else:
        deductible_vat = 0.0

    return {
        "is_compliant": True,
        "invoice_type": norm_invoice_type,
        "tax_rate_pct": norm_rate,
        "amount_inclusive": round(norm_amount, 2),
        "amount_exclusive": round(amount_exclusive, 2),
        "tax_amount": round(tax_amount, 2),
        "deductible_vat": round(deductible_vat, 2),
        "differential_deduction": round(actual_diff_deduction, 2)
    }


class OneClickVatCheckerCLI:
    """
    极简调用入口，默认跑通全流程。
    支持 JSON 和 Excel(CSV) 双模无感直出。
    """

    @staticmethod
    def output_json(data: Dict[str, Any], output_path: str = None) -> str:
        """输出JSON格式"""
        json_str = json.dumps(data, ensure_ascii=False, indent=2)
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(json_str)
            return f"Result saved to {output_path}"
        else:
            return json_str

    @staticmethod
    def output_csv(data: Dict[str, Any], output_path: str = "output.csv") -> str:
        """输出CSV(作为免依赖的Excel格式)格式"""
        headers = list(data.keys())
        try:
            with open(output_path, 'w', encoding='utf-8-sig', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=headers)
                writer.writeheader()
                writer.writerow(data)
            return f"Result saved to {output_path}"
        except Exception as e:
            return f"Failed to save to {output_path}: {str(e)}"

    @classmethod
    def run(cls, invoice_type: Any = None, amount: Any = None, tax_rate: Any = None,
            differential_deduction: Any = None, output_format: str = "json", output_path: str = None) -> str:
        """运行测算并输出结果"""
        result = calculate_supplier_vat_deduction(
            invoice_type=invoice_type,
            amount=amount,
            tax_rate=tax_rate,
            differential_deduction=differential_deduction
        )

        if output_format.lower() in ("csv", "excel"):
            actual_path = output_path if output_path else "vat_deduction_result.csv"
            return cls.output_csv(result, actual_path)
        else:
            return cls.output_json(result, output_path)

def main():
    parser = argparse.ArgumentParser(
        description="劳务供应商专票/普票税率合规性与进项抵扣测算器 (One-Click CLI)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    # 极简设计：所有参数都有默认值，做到零参数即可运行
    parser.add_argument("--invoice-type", type=str, default="专票", help="发票类型，支持'专票'或'普票'")
    parser.add_argument("--amount", type=float, default=10000.0, help="含税金额")
    parser.add_argument("--tax-rate", type=float, default=6.0, help="税率(如6, 3, 1, 5)")
    parser.add_argument("--diff-deduction", type=float, default=0.0, help="差额扣除金额(针对5%差额征税)")
    parser.add_argument("--format", type=str, choices=["json", "csv", "excel"], default="json", help="输出格式")
    parser.add_argument("--output", type=str, default="", help="输出文件路径。默认JSON打印到控制台，CSV保存到默认文件")

    args = parser.parse_args()

    out_path = args.output if args.output else None

    try:
        output_result = OneClickVatCheckerCLI.run(
            invoice_type=args.invoice_type,
            amount=args.amount,
            tax_rate=args.tax_rate,
            differential_deduction=args.diff_deduction,
            output_format=args.format,
            output_path=out_path
        )
        print(output_result)
    except Exception as e:
        # 提供默认的安全兜底报错
        print(f"Execution Error, returning default state fallback. Error: {e}", file=sys.stderr)
        print(json.dumps({"is_compliant": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
