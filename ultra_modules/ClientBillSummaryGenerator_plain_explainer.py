import math

def _safe_float(val, default=0.0):
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f) or f < 0:
            return default
        return f
    except (ValueError, TypeError):
        return default

def generate_plain_explainer(summary_data=None, format_type='json'):
    """
    Translates complex backend bill summary data into a plain, easy-to-understand explanation card.
    Supports json, html, and markdown formats.
    Includes zero configuration defaults and dirty data self-healing.
    """
    if summary_data is None or not isinstance(summary_data, dict):
        summary_data = {}

    format_type = str(format_type).lower().strip()
    if format_type not in ['json', 'html', 'markdown']:
        format_type = 'json'

    # Safe parsing and defaults
    total_hours = _safe_float(summary_data.get('total_hours', 0.0))
    total_base_cost = _safe_float(summary_data.get('total_base_cost', 0.0))
    management_fee_rate = _safe_float(summary_data.get('management_fee_rate', 0.0))
    management_fee = _safe_float(summary_data.get('management_fee', 0.0))
    tax_rate = _safe_float(summary_data.get('tax_rate', 0.0))
    tax = _safe_float(summary_data.get('tax', 0.0))
    subtotal = _safe_float(summary_data.get('subtotal', 0.0))
    grand_total = _safe_float(summary_data.get('grand_total', 0.0))

    # Recalculate basic constraints to self-heal
    if grand_total == 0.0 and (total_base_cost > 0 or management_fee > 0 or tax > 0):
        if management_fee == 0.0 and management_fee_rate > 0:
            management_fee = total_base_cost * management_fee_rate
        subtotal = total_base_cost + management_fee
        if tax == 0.0 and tax_rate > 0:
            tax = subtotal * tax_rate
        grand_total = subtotal + tax

    total_hours_str = f"{total_hours:g}"
    total_base_cost_str = f"{total_base_cost:.2f}"
    management_fee_str = f"{management_fee:.2f}"
    tax_str = f"{tax:.2f}"
    grand_total_str = f"{grand_total:.2f}"
    management_fee_rate_str = f"{management_fee_rate * 100:g}%"
    tax_rate_str = f"{tax_rate * 100:g}%"

    title = "本月结算确认单（大白话版）"
    summary_sentence = f"本月一共为您提供了 {total_hours_str} 小时的服务。需要您支付的总费用为 {grand_total_str} 元。"
    details = [
        f"1. 基础服务费（按工时算）：{total_base_cost_str} 元",
        f"2. 我们的管理费（费率 {management_fee_rate_str}）：{management_fee_str} 元",
        f"3. 需缴纳的税费（税率 {tax_rate_str}）：{tax_str} 元"
    ]
    conclusion = f"以上加起来，总共 {grand_total_str} 元，一分不差。"

    if format_type == 'json':
        return {
            "title": title,
            "summary": summary_sentence,
            "details": details,
            "conclusion": conclusion
        }

    elif format_type == 'markdown':
        md_lines = [
            f"# {title}",
            "",
            f"**{summary_sentence}**",
            "",
            "### 费用明细到底是怎么算的？",
            ""
        ]
        for detail in details:
            md_lines.append(f"- {detail}")
        md_lines.extend([
            "",
            f"> **{conclusion}**"
        ])
        return "\n".join(md_lines)

    elif format_type == 'html':
        html_lines = [
            '<div class="bill-summary-card" style="font-family: sans-serif; padding: 20px; border: 1px solid #ccc; border-radius: 8px; max-width: 400px;">',
            f'  <h2 style="color: #333; margin-top: 0;">{title}</h2>',
            f'  <p style="font-size: 1.1em; font-weight: bold; color: #d9534f;">{summary_sentence}</p>',
            '  <h3 style="font-size: 1em; color: #555;">费用明细到底是怎么算的？</h3>',
            '  <ul style="line-height: 1.6; color: #666;">'
        ]
        for detail in details:
            html_lines.append(f'    <li>{detail}</li>')
        html_lines.extend([
            '  </ul>',
            f'  <div style="margin-top: 15px; padding: 10px; background-color: #f9f9f9; border-left: 4px solid #5cb85c;">',
            f'    <strong>{conclusion}</strong>',
            '  </div>',
            '</div>'
        ])
        return "\n".join(html_lines)
