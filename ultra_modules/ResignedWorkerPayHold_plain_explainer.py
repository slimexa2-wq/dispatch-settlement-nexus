def _clean_float(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        if isinstance(value, bool):
            return float(int(value))
        return float(value)
    if isinstance(value, str):
        cleaned = ''.join(c for c in value if c.isdigit() or c == '.' or c == '-')
        try:
            return float(cleaned)
        except ValueError:
            return default
    return default

def _clean_string(value, default=""):
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip() or default
    return str(value)

def _clean_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes', 'y', 't', '是')
    return default

def explain_pay_hold(data: dict) -> dict:
    """
    Generates a simple business explanation for resigned worker pay deductions.
    Requires no complex configurations. Automatically falls back on missing/dirty data.
    """
    if not isinstance(data, dict):
        data = {}

    worker_name = _clean_string(data.get("worker_name"), "未知员工")
    base_salary = max(0.0, _clean_float(data.get("base_salary"), 0.0))
    deduction_requested = max(0.0, _clean_float(data.get("deduction_requested"), 0.0))
    is_abrupt_resignation = _clean_bool(data.get("is_abrupt_resignation"), False)
<<<<<<< HEAD

=======

>>>>>>> fix-prisma-schema
    max_deduction_rate = _clean_float(data.get("max_deduction_rate"), 0.2)
    if not (0.0 <= max_deduction_rate <= 1.0):
        max_deduction_rate = 0.2

    max_deduction_cap = 0.0
    actual_deduction = 0.0
<<<<<<< HEAD

=======

>>>>>>> fix-prisma-schema
    if is_abrupt_resignation:
        max_deduction_cap = base_salary * max_deduction_rate
        actual_deduction = min(deduction_requested, max_deduction_cap)

    final_pay = base_salary - actual_deduction
<<<<<<< HEAD

=======

>>>>>>> fix-prisma-schema
    # 格式化输出 (Format outputs)
    rate_pct = f"{max_deduction_rate * 100:.0f}%"

    if is_abrupt_resignation:
        if deduction_requested == 0:
            status_text = f"虽然存在急辞/旷工，但未申报扣款。最终应发：{final_pay:.2f}元。"
        elif actual_deduction < deduction_requested:
            status_text = f"申报扣款 {deduction_requested:.2f} 元，但根据合规上限（薪资的 {rate_pct}，即 {max_deduction_cap:.2f} 元），实际仅扣除 {actual_deduction:.2f} 元。最终应发：{final_pay:.2f}元。"
        else:
            status_text = f"申报扣款 {deduction_requested:.2f} 元，未超过合规上限（{max_deduction_cap:.2f} 元），已全额扣除。最终应发：{final_pay:.2f}元。"
    else:
        if deduction_requested > 0:
            status_text = f"正常离职，不得因急辞扣款。原申报的 {deduction_requested:.2f} 元扣款已被系统自动拦截。最终应发：{final_pay:.2f}元。"
        else:
            status_text = f"正常离职，无相关扣款。最终应发：{final_pay:.2f}元。"
<<<<<<< HEAD

=======

>>>>>>> fix-prisma-schema
    summary = f"【员工：{worker_name}】基础薪资 {base_salary:.2f} 元。{status_text}"

    html_card = f"""<div class="pay-hold-card" style="border: 1px solid #e8e8e8; padding: 16px; border-radius: 8px; font-family: sans-serif;">
    <h3 style="margin-top: 0; color: #333;">离职结算对账单 - {worker_name}</h3>
    <ul style="list-style: none; padding-left: 0; line-height: 1.6;">
        <li><strong>基础薪资：</strong> {base_salary:.2f} 元</li>
        <li><strong>离职类型：</strong> {'急辞/旷工' if is_abrupt_resignation else '正常离职'}</li>
        <li><strong>申报扣款：</strong> {deduction_requested:.2f} 元</li>
        <li><strong>合规扣款上限：</strong> {max_deduction_cap:.2f} 元 ({rate_pct})</li>
        <li><strong>实际生效扣款：</strong> {actual_deduction:.2f} 元</li>
        <li style="font-size: 1.1em; color: #d9001b; margin-top: 8px;"><strong>最终应发：</strong> {final_pay:.2f} 元</li>
    </ul>
    <div style="background-color: #f6ffed; border: 1px solid #b7eb8f; padding: 8px 12px; border-radius: 4px; color: #389e0d; margin-top: 12px;">
        <strong>智能诊断：</strong>{status_text}
    </div>
</div>"""

    markdown_card = f"""### 离职结算对账单 - {worker_name}
- **基础薪资**：{base_salary:.2f} 元
- **离职类型**：{'急辞/旷工' if is_abrupt_resignation else '正常离职'}
- **申报扣款**：{deduction_requested:.2f} 元
- **合规扣款上限**：{max_deduction_cap:.2f} 元 ({rate_pct})
- **实际生效扣款**：{actual_deduction:.2f} 元

**最终应发**：{final_pay:.2f} 元

> **智能诊断**：{status_text}
"""

    return {
        "worker_name": worker_name,
        "base_salary": base_salary,
        "is_abrupt_resignation": is_abrupt_resignation,
        "deduction_requested": deduction_requested,
        "max_deduction_cap": max_deduction_cap,
        "actual_deduction": actual_deduction,
        "final_pay": final_pay,
        "plain_summary": summary,
        "html_card": html_card,
        "markdown_card": markdown_card
    }
