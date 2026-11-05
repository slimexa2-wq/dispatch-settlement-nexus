import json
from decimal import Decimal, InvalidOperation

def _to_decimal(val, default="0") -> Decimal:
    if val is None:
        return Decimal(default)
    try:
        # Convert to string first to handle floats/ints/strings uniformly
        d = Decimal(str(val))
        if d < 0:
            return Decimal("0")
        return d
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)

def generate_deduction_explainer(worker_data=None):
    """
    Generates a plain-language explanation of wage deductions for a worker.
    Zero-configuration: missing data uses reasonable defaults.
    """
    if worker_data is None:
        worker_data = {}

    worker_name = str(worker_data.get("worker_name", "未知员工"))
    if worker_name.strip() == "None" or worker_name.strip() == "":
        worker_name = "未知员工"

    total_salary = _to_decimal(worker_data.get("total_salary"))
    advances = _to_decimal(worker_data.get("weekly_advances"))
    living_expenses = _to_decimal(worker_data.get("living_expenses"))

    # Calculate requested total deduction
    requested_deduction = advances + living_expenses

    # Minimum retained salary ratio to protect worker (e.g., must keep at least 10%)
    # Wait, the prompt says "Calculate maximum allowable deduction based on an automatic minimum retained salary threshold"
    # Let's say, they must take home at least 500, OR 10% of their salary, whichever is lower?
    # Or simply a fixed threshold, e.g., keep at least 200, or if total salary < 200, keep total salary.
    # Let's use 20% of salary as minimum retained salary.
    min_retained_ratio = Decimal("0.20")
    min_retained_salary = (total_salary * min_retained_ratio).quantize(Decimal("0.01"))

    # Alternatively, max allowable deduction
    max_allowable_deduction = total_salary - min_retained_salary
    if max_allowable_deduction < 0:
        max_allowable_deduction = Decimal("0")

    actual_deduction = min(requested_deduction, max_allowable_deduction)
    remaining_advance_debt = requested_deduction - actual_deduction
    final_payout = total_salary - actual_deduction

    # Generate simple explanation text
    if requested_deduction > max_allowable_deduction:
        status_msg = f"（已触发防超扣保护，部分借支延后扣除）"
    else:
        status_msg = "（全额正常抵扣）"

    plain_text = (
        f"【员工预支抵扣说明卡】\n"
        f"姓名：{worker_name}\n"
        f"本月应发工资：{total_salary:.2f} 元\n"
        f"本月申请抵扣总额：{requested_deduction:.2f} 元（其中生活费 {living_expenses:.2f} 元，周借支 {advances:.2f} 元）\n"
        f"防超扣最高允许扣除：{max_allowable_deduction:.2f} 元\n"
        f"实际扣除：{actual_deduction:.2f} 元 {status_msg}\n"
        f"------------------------\n"
        f"最终实发：{final_payout:.2f} 元\n"
    )

    if remaining_advance_debt > 0:
        plain_text += f"未扣完的借支欠款：{remaining_advance_debt:.2f} 元（将顺延至下月）\n"

    # HTML format
    html_text = f"""<div class="deduction-card" style="font-family: sans-serif; border: 1px solid #ccc; padding: 16px; max-width: 400px; border-radius: 8px;">
    <h3 style="margin-top: 0;">员工预支抵扣说明卡</h3>
    <p><strong>姓名：</strong>{worker_name}</p>
    <p><strong>本月应发工资：</strong><span style="color: #2c3e50;">{total_salary:.2f}</span> 元</p>
    <p><strong>本月申请抵扣总额：</strong>{requested_deduction:.2f} 元<br>
       <small style="color: #7f8c8d;">（其中生活费 {living_expenses:.2f} 元，周借支 {advances:.2f} 元）</small></p>
    <p><strong>防超扣最高允许扣除：</strong>{max_allowable_deduction:.2f} 元</p>
    <p><strong>实际扣除：</strong><span style="color: #c0392b;">{actual_deduction:.2f}</span> 元 <em>{status_msg}</em></p>
    <hr style="border: 0; border-top: 1px solid #eee; margin: 16px 0;">
    <p style="font-size: 1.2em;"><strong>最终实发：</strong><span style="color: #27ae60;">{final_payout:.2f}</span> 元</p>
"""
    if remaining_advance_debt > 0:
        html_text += f'    <p style="color: #e67e22;"><small>未扣完的借支欠款：{remaining_advance_debt:.2f} 元（将顺延至下月）</small></p>\n'
    html_text += "</div>"

    # Markdown format
    markdown_text = (
        f"### 员工预支抵扣说明卡\n\n"
        f"- **姓名：** {worker_name}\n"
        f"- **本月应发工资：** {total_salary:.2f} 元\n"
        f"- **本月申请抵扣总额：** {requested_deduction:.2f} 元 (其中生活费 {living_expenses:.2f} 元，周借支 {advances:.2f} 元)\n"
        f"- **防超扣最高允许扣除：** {max_allowable_deduction:.2f} 元\n"
        f"- **实际扣除：** {actual_deduction:.2f} 元 *{status_msg}*\n"
        f"\n---\n\n"
        f"**最终实发：** {final_payout:.2f} 元\n"
    )
    if remaining_advance_debt > 0:
        markdown_text += f"\n> 未扣完的借支欠款：{remaining_advance_debt:.2f} 元（将顺延至下月）\n"

    return {
        "text": plain_text,
        "html": html_text,
        "markdown": markdown_text,
        "json": json.dumps({
            "worker_name": worker_name,
            "total_salary": float(total_salary),
            "requested_deduction": float(requested_deduction),
            "living_expenses": float(living_expenses),
            "weekly_advances": float(advances),
            "max_allowable_deduction": float(max_allowable_deduction),
            "actual_deduction": float(actual_deduction),
            "final_payout": float(final_payout),
            "remaining_advance_debt": float(remaining_advance_debt),
            "protection_triggered": remaining_advance_debt > 0
        }, ensure_ascii=False)
    }
