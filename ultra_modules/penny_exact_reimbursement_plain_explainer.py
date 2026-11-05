import json
import re
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Union

def sanitize_amount(amount: Union[str, float, int, None]) -> Decimal:
    """
    Sanitize and autocorrect bad inputs to convert into a valid Decimal amount in Yuan.
    """
    if amount is None or amount == "":
        return Decimal("0.00")

    amount_str = str(amount).strip()

    # Remove currency symbols and commas (e.g. $1,234.56 or ￥ 1,234.56)
    amount_str = re.sub(r'[^\d\.\-]', '', amount_str)

    try:
        val = Decimal(amount_str)
        if val < 0:
            return Decimal("0.00")
        return val
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0.00")

def generate_explainer_card(
    amount_yuan: Union[str, float, int, None] = 0,
    invoices: Optional[List[str]] = None,
    output_format: str = "JSON"
) -> str:
    """
    Generate a plain language explainer card for a reimbursement amount and its invoices.

    Args:
        amount_yuan: The reimbursement amount in Yuan (str, float, int, None).
        invoices: A list of invoice numbers (List[str]).
        output_format: The format of the output card ("JSON", "HTML", "Markdown").

    Returns:
        A formatted string (JSON, HTML, or Markdown) explaining the reimbursement.
    """
    # 缺参自动设合理默认值 (Auto-defaulting for missing params)
    if invoices is None:
        invoices = []

    # Ensure invoices are strings and handle potential missing values
    invoices = [str(inv).strip() for inv in invoices if inv is not None and str(inv).strip()]

    # 脏数据自愈: Convert input to clean Decimal
    val_yuan = sanitize_amount(amount_yuan)

    # 零精度损失核算: Exact conversion to integer cents
    cents = int((val_yuan * Decimal("100")).to_integral_value())

    # 发票连号防重器: Remove duplicates while preserving original order
    seen = set()
    unique_invoices = []
    duplicate_invoices = []
    for inv in invoices:
        if inv not in seen:
            unique_invoices.append(inv)
            seen.add(inv)
        else:
            duplicate_invoices.append(inv)

    has_duplicates = len(duplicate_invoices) > 0

    # Create the plain explanation
    conclusion = "审核通过。" if not has_duplicates else f"警告：发现重复发票（{', '.join(duplicate_invoices)}），已自动剔除。"
    if cents == 0:
        conclusion = "提示：报销金额为 0 或输入无效，无需打款。"

    data = {
        "title": "报销金额核算与发票防重摘要",
        "original_yuan": str(val_yuan),
        "exact_cents": cents,
        "valid_invoices_count": len(unique_invoices),
        "valid_invoices": unique_invoices,
        "has_duplicates": has_duplicates,
        "conclusion": conclusion
    }

    output_format = str(output_format).strip().upper()

    if output_format == "HTML":
        html = f"""<div class="explainer-card">
  <h2>{data['title']}</h2>
  <p><strong>核准报销金额：</strong>{data['original_yuan']} 元（即 {data['exact_cents']} 分）</p>
  <p><strong>有效发票数量：</strong>{data['valid_invoices_count']} 张</p>
  <p><strong>发票明细：</strong>{', '.join(data['valid_invoices']) if data['valid_invoices'] else '无'}</p>
  <p><strong>处理结论：</strong>{data['conclusion']}</p>
</div>"""
        return html

    elif output_format == "MARKDOWN":
        md = f"""### {data['title']}

- **核准报销金额**：{data['original_yuan']} 元（即 {data['exact_cents']} 分）
- **有效发票数量**：{data['valid_invoices_count']} 张
- **发票明细**：{', '.join(data['valid_invoices']) if data['valid_invoices'] else '无'}
- **处理结论**：{data['conclusion']}
"""
        return md

    # Default to JSON
    return json.dumps(data, ensure_ascii=False, indent=2)
