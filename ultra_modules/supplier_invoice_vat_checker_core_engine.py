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
