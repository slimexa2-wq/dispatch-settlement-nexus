import json

class SupplierInvoiceVatCheckerPlainExplainer:
    """
    劳务供应商专票/普票税率合规性与进项抵扣测算大白话摘要生成器
    """

    @staticmethod
    def explain(calculation_result, output_format='json'):
        """
        将复杂后台计算结果转化为普通业务人员1秒看懂的大白话结论卡
        :param calculation_result: dict 或 json string, 包含 is_valid, applied_invoice_type, applied_vat_rate, amount_without_tax, tax_amount, deductible_amount
        :param output_format: 'json', 'html', 'markdown'
        :return: 对应格式的大白话摘要卡片数据
        """

        # 脏数据自愈：如果是字符串则尝试解析，解析失败则回退为空字典
        if isinstance(calculation_result, str):
            try:
                calculation_result = json.loads(calculation_result)
            except (json.JSONDecodeError, TypeError):
                calculation_result = {}

        if not isinstance(calculation_result, dict):
            calculation_result = {}

        # 缺参默认兜底
        is_valid = calculation_result.get('is_valid', False)
        invoice_type = str(calculation_result.get('applied_invoice_type', '未知类型')).strip()
        vat_rate = str(calculation_result.get('applied_vat_rate', '0%')).strip()

        try:
            deductible_amount = float(calculation_result.get('deductible_amount', 0.0))
        except (ValueError, TypeError):
            deductible_amount = 0.0

        try:
            tax_amount = float(calculation_result.get('tax_amount', 0.0))
        except (ValueError, TypeError):
            tax_amount = 0.0

        try:
            amount_without_tax = float(calculation_result.get('amount_without_tax', 0.0))
        except (ValueError, TypeError):
            amount_without_tax = 0.0

        # 极端边界防御
        if deductible_amount < 0:
            deductible_amount = 0.0
        if tax_amount < 0:
            tax_amount = 0.0
        if amount_without_tax < 0:
            amount_without_tax = 0.0

        if not is_valid:
            title = "⚠️ 发票异常，请核对"
            summary = "发票信息有误，可能存在金额为空或格式错误。系统按 0 元处理进项抵扣。"
            highlight = "无法抵扣"
        elif invoice_type == '专票':
            title = f"✅ 收到一张 {vat_rate} 增值税专用发票"
            summary = f"这张专票的金额已自动拆分，其中不含税金额为 {amount_without_tax:.2f} 元，包含了 {tax_amount:.2f} 元的税额。因为是专票，我们可以用它抵扣 {deductible_amount:.2f} 元的进项税！"
            highlight = f"可抵扣 {deductible_amount:.2f} 元"
        else:
            title = f"📄 收到一张 {vat_rate} 增值税普通发票"
            summary = f"这张普票的金额已拆分为不含税金额 {amount_without_tax:.2f} 元和税额 {tax_amount:.2f} 元。但注意，普票不能用来抵扣进项税。"
            highlight = "不可抵扣"

        # 缺参默认兜底格式支持
        format_type = str(output_format).strip().lower()
        if format_type not in ('json', 'html', 'markdown'):
            format_type = 'json'

        if format_type == 'html':
            return f'''<div class="invoice-card" style="border: 1px solid #ddd; padding: 16px; border-radius: 8px;">
    <h3 style="margin-top: 0; color: {'#d9534f' if not is_valid else ('#5cb85c' if invoice_type == '专票' else '#337ab7')};">{title}</h3>
    <p style="font-size: 14px; color: #555;">{summary}</p>
    <div style="font-weight: bold; font-size: 16px; padding-top: 8px; border-top: 1px dashed #eee;">核心结论：<span style="color: {'#d9534f' if highlight in ('无法抵扣', '不可抵扣') else '#5cb85c'};">{highlight}</span></div>
</div>'''

        if format_type == 'markdown':
            return f'''### {title}
> {summary}

**核心结论：** `{highlight}`'''

        # default JSON
        return json.dumps({
            "title": title,
            "summary": summary,
            "highlight": highlight
        }, ensure_ascii=False)
