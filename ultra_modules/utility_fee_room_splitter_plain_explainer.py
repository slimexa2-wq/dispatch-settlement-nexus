import decimal
from decimal import Decimal
import json

def generate_explanation_card(total_amount=None, occupants=None, format_type='markdown'):
    """
    Generate an explanation card for utility fee room splitting.

    Args:
        total_amount: The total fee amount to be split. Can be dirty.
        occupants: A list of dicts, e.g., [{'name': 'Alice', 'days': 30}, ...]. Can be dirty or missing.
        format_type: Output format, either 'markdown', 'json', or 'html'.

    Returns:
        A string representing the explanation card in the chosen format.
    """
    # 1. Dirty data healing for total_amount
    try:
        if total_amount is None:
            total = Decimal('0.00')
        else:
            total = Decimal(str(total_amount))
            if total < 0:
                total = Decimal('0.00')
    except (decimal.InvalidOperation, TypeError, ValueError):
        total = Decimal('0.00')

    total = total.quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)

    # 2. Dirty data healing for occupants
    valid_occupants = []
    if isinstance(occupants, list):
        for occ in occupants:
            if not isinstance(occ, dict):
                continue

            # Heal name
            name = str(occ.get('name', '未知人员'))
            if not name or name.strip() == '' or name == 'None' or name == 'Unknown':
                name = '未知人员'
            else:
                name = name.strip()

            # Heal days
            try:
                days_raw = occ.get('days')
                if days_raw is None:
                    days = 30
                else:
                    days = int(float(days_raw))
                    if days < 0:
                        days = 0
            except (ValueError, TypeError):
                days = 30

            valid_occupants.append({'name': name, 'days': days})

    # 3. Financial Calculation (exact penny splitting)
    total_days = sum(occ['days'] for occ in valid_occupants)
    total_days_decimal = Decimal(total_days)

    results = []

    if total_days == 0 or total == Decimal('0.00') or not valid_occupants:
        for occ in valid_occupants:
            results.append({
                'name': occ['name'],
                'days': occ['days'],
                'fee_str': '0.00'
            })
    else:
        allocated = Decimal('0.00')
        # First pass: calculate exact mathematical share and allocate the rounded-down penny value
        for occ in valid_occupants:
            exact = total * Decimal(occ['days']) / total_days_decimal
            share = exact.quantize(Decimal('0.01'), rounding=decimal.ROUND_DOWN)
            occ['exact'] = exact
            occ['share'] = share
            allocated += share

        # Second pass: distribute the remaining pennies
        remainder = total - allocated
        pennies = int((remainder * 100).to_integral_value())

        if pennies > 0:
            indices = list(range(len(valid_occupants)))
            # Sort by who lost the most precision during rounding down
            # Using stable sort to fall back to original array order for ties
            indices.sort(key=lambda i: valid_occupants[i]['exact'] - valid_occupants[i]['share'], reverse=True)

            for i in range(pennies):
                idx = indices[i % len(indices)]
                valid_occupants[idx]['share'] += Decimal('0.01')

        for occ in valid_occupants:
            results.append({
                'name': occ['name'],
                'days': occ['days'],
                'fee_str': str(occ['share'].quantize(Decimal('0.01')))
            })

    # 4. Format Output
    if format_type is None:
        format_type = 'markdown'
    else:
        format_type = str(format_type).lower().strip()

    if format_type == 'json':
        output = {
            'total_amount': str(total),
            'total_days': total_days,
            'details': results
        }
        return json.dumps(output, ensure_ascii=False, indent=2)

    elif format_type == 'html':
        rows = "".join([
            f"<tr><td style='padding:8px; border-bottom:1px solid #eee;'>{r['name']}</td><td style='padding:8px; border-bottom:1px solid #eee;'>{r['days']} 天</td><td style='padding:8px; border-bottom:1px solid #eee;'><strong>{r['fee_str']} 元</strong></td></tr>"
            for r in results
        ])
        if not rows:
            rows = "<tr><td colspan='3' style='padding:8px; text-align:center;'>无分摊人员数据</td></tr>"

        html = f"""<div style="font-family: sans-serif; max-width: 400px; border: 1px solid #ccc; border-radius: 8px; padding: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
  <h3 style="margin-top: 0; color: #333;">💡 费用分摊白话说明卡</h3>
  <p style="color: #666; font-size: 14px;">本次总费用为 <strong>{total}</strong> 元，参与分摊的总天数为 <strong>{total_days}</strong> 天。<br>按照每个人实际在住天数，为您计算出以下公平的分摊结果（已自动处理除不尽的零头）：</p>
  <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
    <thead>
      <tr style="background-color: #f9f9f9;">
        <th style="padding: 8px; border-bottom: 2px solid #ddd;">姓名</th>
        <th style="padding: 8px; border-bottom: 2px solid #ddd;">在住天数</th>
        <th style="padding: 8px; border-bottom: 2px solid #ddd;">应扣费用</th>
      </tr>
    </thead>
    <tbody>
      {rows}
    </tbody>
  </table>
</div>"""
        return html

    else:
        # Default to markdown
        lines = [
            "### 💡 费用分摊白话说明卡",
            "",
            f"本次总费用为 **{total}** 元，参与分摊的总天数为 **{total_days}** 天。",
            "按照每个人实际在住天数，为您计算出以下公平的分摊结果（已自动处理除不尽的零头）：",
            "",
            "| 姓名 | 在住天数 | 应扣费用 |",
            "| :--- | :--- | :--- |"
        ]
        if not results:
            lines.append("| 无数据 | 0 天 | **0.00 元** |")
        else:
            for r in results:
                lines.append(f"| {r['name']} | {r['days']} 天 | **{r['fee_str']} 元** |")

        return "\n".join(lines)
