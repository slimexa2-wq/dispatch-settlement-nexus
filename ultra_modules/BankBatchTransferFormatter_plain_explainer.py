import json
import re

class BankBatchTransferFormatter:
    """
    Formatter for batch bank transfer operations.
    Supports basic validation and generating explainer cards (JSON, Markdown, HTML).
    Handles missing parameters and dirty data (self-healing/fallback).
    """

    def __init__(self, records=None, bank_name=""):
        self.records = self._heal_records(records)
        self.bank_name = bank_name if bank_name else "通用银行"

    def _heal_records(self, records):
        if not records:
            return []
        if not isinstance(records, list):
            records = [records]

        healed = []
        for r in records:
            if not isinstance(r, dict):
                continue

            card_no = str(r.get("card_number", "")).strip()
            # Remove any non-digit character for self-healing
            card_no = re.sub(r"\D", "", card_no)

            amount = r.get("amount", 0)
            try:
                amount = float(amount)
                if amount < 0:
                    amount = 0.0
            except (ValueError, TypeError):
                amount = 0.0

            name = str(r.get("name", "")).strip()
            if not name:
                name = "未知收款人"

            healed.append({
                "name": name,
                "card_number": card_no,
                "amount": amount,
                "is_luhn_valid": self.check_luhn(card_no) if card_no else False
            })

        return healed

    @staticmethod
    def check_luhn(card_no: str) -> bool:
        """
        Luhn algorithm check for bank card numbers.
        """
        if not card_no or not card_no.isdigit():
            return False

        digits = [int(x) for x in card_no]
        checksum = 0
        reverse_digits = digits[::-1]

        for i, d in enumerate(reverse_digits):
            if i % 2 == 1:
                d *= 2
                if d > 9:
                    d -= 9
            checksum += d

        return checksum % 10 == 0

    def generate_summary(self):
        total_count = len(self.records)
        valid_records = [r for r in self.records if r["is_luhn_valid"]]
        valid_count = len(valid_records)
        invalid_count = total_count - valid_count
        total_amount = sum(r["amount"] for r in valid_records)

        return {
            "bank_name": self.bank_name,
            "total_count": total_count,
            "valid_count": valid_count,
            "invalid_count": invalid_count,
            "total_valid_amount": total_amount,
            "records": self.records
        }

    def to_json(self):
        return json.dumps(self.generate_summary(), ensure_ascii=False, indent=2)

    def to_markdown(self):
        summary = self.generate_summary()
        md = []
        md.append(f"## {summary['bank_name']} 代发工资业务摘要")
        md.append("")
        md.append(f"- **总记录数**: {summary['total_count']} 笔")
        md.append(f"- **有效记录数 (卡号校验通过)**: {summary['valid_count']} 笔")
        md.append(f"- **异常记录数 (卡号校验失败)**: {summary['invalid_count']} 笔")
        md.append(f"- **预计代发总额**: ¥{summary['total_valid_amount']:.2f}")
        md.append("")
        if summary['invalid_count'] > 0:
            md.append("### ⚠️ 异常卡号提醒")
            for r in summary['records']:
                if not r['is_luhn_valid']:
                    md.append(f"- {r['name']}: {r['card_number'] or '空'} (金额: ¥{r['amount']:.2f})")

        return "\n".join(md)

    def to_html(self):
        summary = self.generate_summary()
        html = []
        html.append(f"<div class='bank-transfer-card'>")
        html.append(f"<h2>{summary['bank_name']} 代发工资业务摘要</h2>")
        html.append("<ul>")
        html.append(f"<li><strong>总记录数:</strong> {summary['total_count']} 笔</li>")
        html.append(f"<li><strong>有效记录数:</strong> {summary['valid_count']} 笔</li>")
        html.append(f"<li><strong>异常记录数:</strong> <span style='color:red'>{summary['invalid_count']}</span> 笔</li>")
        html.append(f"<li><strong>预计代发总额:</strong> ¥{summary['total_valid_amount']:.2f}</li>")
        html.append("</ul>")

        if summary['invalid_count'] > 0:
            html.append("<div class='warning'>")
            html.append("<h3>⚠️ 异常卡号提醒</h3>")
            html.append("<ul>")
            for r in summary['records']:
                if not r['is_luhn_valid']:
                    html.append(f"<li>{r['name']}: {r['card_number'] or '空'} (金额: ¥{r['amount']:.2f})</li>")
            html.append("</ul>")
            html.append("</div>")

        html.append("</div>")
        return "".join(html)
