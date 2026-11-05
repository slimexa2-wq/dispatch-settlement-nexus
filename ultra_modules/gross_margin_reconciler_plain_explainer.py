import json
from typing import Any, Dict

def _safe_float(value: Any, default: float = 0.0) -> float:
    """Safely convert any value to float. Silently fallback to default if error."""
    if value is None:
        return default
    try:
        val = float(value)
        # Handle nan/inf if necessary, though float() doesn't usually raise for them,
        # we can just use them or maybe filter them, but standard float is fine.
        import math
        if math.isnan(val) or math.isinf(val):
            return default
        return val
    except (ValueError, TypeError):
        return default

def generate_explainer_card(
    project_name: Any = "未知项目",
    month: Any = "未知月份",
    receivable_billing: Any = 0.0,
    payable_equal_pay: Any = 0.0,
    payable_rebate: Any = 0.0,
    payable_self_recruit_commission: Any = 0.0
) -> Dict[str, str]:
    """
    Generate plain-language explainer card for gross margin reconciliation.
    Includes Markdown, HTML, and JSON representations.
    """
    p_name = str(project_name) if project_name is not None else "未知项目"
    p_month = str(month) if month is not None else "未知月份"

    recv_billing = _safe_float(receivable_billing)
    pay_equal = _safe_float(payable_equal_pay)
    pay_rebate = _safe_float(payable_rebate)
    pay_comm = _safe_float(payable_self_recruit_commission)

    # Calculate gross margin
    gross_margin = recv_billing - pay_equal - pay_rebate - pay_comm

    # Plain text explanation
    explanation = (
        f"这是【{p_name}】项目在【{p_month}】的净毛利情况：\n"
        f"我们一共向客户收了开票总额 {recv_billing:.2f} 元。\n"
        f"其中，我们需要付给员工同工同酬薪资 {pay_equal:.2f} 元，"
        f"支付返费 {pay_rebate:.2f} 元，"
        f"还要发自招提成 {pay_comm:.2f} 元。\n"
        f"扣除所有应付成本后，这个项目我们真正赚到的净毛利是 {gross_margin:.2f} 元。"
    )

    # Generate Markdown
    md_output = (
        f"### 📊 【{p_name}】项目 {p_month} 对账单（极简版）\n\n"
        f"**💰 我们的应收（进项）：**\n"
        f"- 客户开票总额：**{recv_billing:.2f}** 元\n\n"
        f"**💸 我们的应付（出项）：**\n"
        f"- 同工同酬薪资：**{pay_equal:.2f}** 元\n"
        f"- 员工返费：**{pay_rebate:.2f}** 元\n"
        f"- 自招提成：**{pay_comm:.2f}** 元\n\n"
        f"---\n"
        f"**🏆 最终净毛利（赚到的钱）：**\n"
        f"> **{gross_margin:.2f}** 元\n\n"
        f"*{explanation}*"
    )

    # Generate HTML
    html_output = (
        f"<div class='reconciliation-card' style='font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;'>"
        f"<h3 style='margin-top:0;'>📊 【{p_name}】项目 {p_month} 对账单（极简版）</h3>"
        f"<p><strong>💰 我们的应收（进项）：</strong></p>"
        f"<ul><li>客户开票总额：<strong>{recv_billing:.2f}</strong> 元</li></ul>"
        f"<p><strong>💸 我们的应付（出项）：</strong></p>"
        f"<ul>"
        f"<li>同工同酬薪资：<strong>{pay_equal:.2f}</strong> 元</li>"
        f"<li>员工返费：<strong>{pay_rebate:.2f}</strong> 元</li>"
        f"<li>自招提成：<strong>{pay_comm:.2f}</strong> 元</li>"
        f"</ul>"
        f"<hr style='border: none; border-top: 1px solid #ddd; margin: 20px 0;'/>"
        f"<h4>🏆 最终净毛利（赚到的钱）：<span style='color: #d9534f;'>{gross_margin:.2f}</span> 元</h4>"
        f"<p style='color: #666; font-size: 0.9em;'><em>{explanation}</em></p>"
        f"</div>"
    )

    # Generate JSON
    json_data = {
        "project_name": p_name,
        "month": p_month,
        "receivable": {
            "billing": round(recv_billing, 2)
        },
        "payable": {
            "equal_pay": round(pay_equal, 2),
            "rebate": round(pay_rebate, 2),
            "self_recruit_commission": round(pay_comm, 2),
            "total_payable": round(pay_equal + pay_rebate + pay_comm, 2)
        },
        "gross_margin": round(gross_margin, 2),
        "plain_explanation": explanation
    }

    return {
        "markdown": md_output,
        "html": html_output,
        "json": json.dumps(json_data, ensure_ascii=False)
    }
