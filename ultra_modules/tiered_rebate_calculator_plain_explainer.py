import json

class TieredRebateCalculatorPlainExplainer:
    def __init__(self, worked_days=0, absent_days=0, tiers=None, deduction_per_absent_day=0):
        self.worked_days = self._parse_int(worked_days, 0)
        self.absent_days = self._parse_int(absent_days, 0)
        self.deduction_per_absent_day = self._parse_float(deduction_per_absent_day, 0.0)

        # Default tiers if not provided
        if not tiers:
            self.tiers = {7: 500.0, 15: 1000.0, 30: 2000.0, 45: 3000.0}
        else:
            self.tiers = self._parse_tiers(tiers)

    def _parse_int(self, val, default):
        try:
            # Handle string like "15天" -> 15
            if isinstance(val, str):
                import re
                match = re.search(r'-?\d+', val)
                if match:
                    return int(match.group())
            return int(float(val))
        except (ValueError, TypeError):
            return default

    def _parse_float(self, val, default):
        try:
            if isinstance(val, str):
                import re
                match = re.search(r'-?\d+(\.\d+)?', val)
                if match:
                    return float(match.group())
            return float(val)
        except (ValueError, TypeError):
            return default

    def _parse_tiers(self, tiers_dict):
        parsed = {}
        if not isinstance(tiers_dict, dict):
            return {7: 500.0, 15: 1000.0, 30: 2000.0, 45: 3000.0}

        for k, v in tiers_dict.items():
            parsed_k = self._parse_int(k, None)
            parsed_v = self._parse_float(v, None)
            if parsed_k is not None and parsed_v is not None:
                parsed[parsed_k] = parsed_v

        # If empty after parsing, return default
        if not parsed:
            return {7: 500.0, 15: 1000.0, 30: 2000.0, 45: 3000.0}
        return parsed

    def calculate(self):
        # Sort tiers by days ascending
        sorted_tiers = sorted(self.tiers.items())

        # Calculate base rebate based on worked days
        base_rebate = 0.0
        achieved_tier_days = 0

        for days, rebate in sorted_tiers:
            if self.worked_days >= days:
                base_rebate = rebate
                achieved_tier_days = days

        # Calculate deduction
        deduction = self.absent_days * self.deduction_per_absent_day

        # Final rebate cannot be negative
        final_rebate = max(0.0, base_rebate - deduction)

        # Determine next tier
        next_tier_days = None
        next_tier_rebate = None
        for days, rebate in sorted_tiers:
            if days > self.worked_days:
                next_tier_days = days
                next_tier_rebate = rebate
                break

        return {
            "worked_days": self.worked_days,
            "absent_days": self.absent_days,
            "achieved_tier_days": achieved_tier_days,
            "base_rebate": base_rebate,
            "deduction": deduction,
            "final_rebate": final_rebate,
            "next_tier_days": next_tier_days,
            "next_tier_rebate": next_tier_rebate,
            "days_to_next_tier": next_tier_days - self.worked_days if next_tier_days else None
        }

    def generate_summary(self):
        result = self.calculate()

        # Build plain text summary
        summary = f"工人已打卡 {result['worked_days']} 天"
        if result['absent_days'] > 0:
            summary += f"（旷工 {result['absent_days']} 天，扣减 {result['deduction']} 元）"
        summary += "。"

        if result['achieved_tier_days'] > 0:
            summary += f"已达标 {result['achieved_tier_days']} 天阶梯，基础返费 {result['base_rebate']} 元。"
        else:
            summary += "暂未达到最低返费标准。"

        summary += f"最终可得返费：{result['final_rebate']} 元。"

        if result['next_tier_days']:
            summary += f"再打卡 {result['days_to_next_tier']} 天即可达到 {result['next_tier_days']} 天阶梯，拿 {result['next_tier_rebate']} 元！"
        else:
            summary += "已达到最高阶梯返费！"

        return summary

    def export(self, format="json"):
        result = self.calculate()
        summary = self.generate_summary()

        data = {
            "result": result,
            "summary": summary
        }

        if format == "json":
            return json.dumps(data, ensure_ascii=False, indent=2)
        elif format == "markdown":
            md = f"## 返费结算卡片\n\n"
            md += f"**{summary}**\n\n"
            md += f"- **已出勤：** {result['worked_days']} 天\n"
            md += f"- **旷工：** {result['absent_days']} 天\n"
            md += f"- **基础返费：** {result['base_rebate']} 元\n"
            md += f"- **旷工扣减：** {result['deduction']} 元\n"
            md += f"- **最终返费：** <strong style='color:red;font-size:1.2em;'>{result['final_rebate']} 元</strong>\n"
            return md
        elif format == "html":
            html = f"""<div class="rebate-card" style="border: 1px solid #ddd; padding: 15px; border-radius: 8px; font-family: sans-serif;">
    <h3 style="margin-top: 0; color: #333;">返费结算摘要</h3>
    <p style="font-size: 16px; color: #555;">{summary}</p>
    <ul style="list-style-type: none; padding-left: 0;">
        <li>✅ 已出勤：<strong>{result['worked_days']}</strong> 天</li>
        <li>❌ 旷工：<strong>{result['absent_days']}</strong> 天 (扣减 {result['deduction']} 元)</li>
        <li>💰 基础返费：<strong>{result['base_rebate']}</strong> 元</li>
    </ul>
    <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
        <span style="font-size: 14px; color: #666;">最终到手：</span>
        <span style="font-size: 24px; font-weight: bold; color: #e74c3c;">¥{result['final_rebate']}</span>
    </div>
</div>"""
            return html
        else:
            return data
