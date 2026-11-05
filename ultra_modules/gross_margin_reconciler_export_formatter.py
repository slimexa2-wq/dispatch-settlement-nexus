import csv
import io
import math
import datetime

def _safe_float(value):
    """Helper to convert value to float, defaulting to 0.0 for invalid/NaN/None."""
    if value is None:
        return 0.0
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    except (ValueError, TypeError):
        return 0.0

def format_gross_margin_export(data=None, project_name=None, report_date=None):
    """
    Generates a pure CSV export for gross margin reconciliation and a 3-line report summary.
    Gracefully defaults missing parameters and silently cleans dirty data.

    Args:
        data (list of dict): List of records containing employee/billing details.
        project_name (str): Name of the project.
        report_date (str): Date of the report.

    Returns:
        dict: A dictionary containing 'csv_content' (str) and 'report_summary' (str).
    """
    # Self-healing missing parameters
    if not isinstance(data, list):
        data = []

    if not project_name:
        project_name = "未命名项目"

    if not report_date:
        report_date = datetime.datetime.now().strftime("%Y-%m-%d")

    # Metrics aggregation
    total_receivable = 0.0
    total_payable_equal_pay = 0.0
    total_payable_return_fee = 0.0
    total_payable_commission = 0.0

    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    writer.writerow([
        "姓名", "应收开票", "应付(同工同酬)", "应付(返费)", "应付(自招提成)", "单人净毛利"
    ])

    valid_rows_count = 0
    for row in data:
        if not isinstance(row, dict):
            continue

        raw_name = row.get("name")
        if raw_name is None:
            name = "未知人员"
        else:
            name = str(raw_name).strip() or "未知人员"

        receivable = _safe_float(row.get("receivable"))
        payable_equal_pay = _safe_float(row.get("payable_equal_pay"))
        payable_return_fee = _safe_float(row.get("payable_return_fee"))
        payable_commission = _safe_float(row.get("payable_commission"))

        individual_gross_margin = receivable - (payable_equal_pay + payable_return_fee + payable_commission)

        total_receivable += receivable
        total_payable_equal_pay += payable_equal_pay
        total_payable_return_fee += payable_return_fee
        total_payable_commission += payable_commission

        writer.writerow([
            name,
            f"{receivable:.2f}",
            f"{payable_equal_pay:.2f}",
            f"{payable_return_fee:.2f}",
            f"{payable_commission:.2f}",
            f"{individual_gross_margin:.2f}"
        ])

        valid_rows_count += 1

    total_payable = total_payable_equal_pay + total_payable_return_fee + total_payable_commission
    total_gross_margin = total_receivable - total_payable

    csv_content = output.getvalue()

    # Generate 3-line minimalist report summary
    report_summary = (
        f"【{project_name}】{report_date}对账单简报\n"
        f"总核算人数：{valid_rows_count}人，总应收：{total_receivable:.2f}元，总应付：{total_payable:.2f}元\n"
        f"最终净毛利：{total_gross_margin:.2f}元，详情见导出文件。"
    )

    return {
        "csv_content": csv_content,
        "report_summary": report_summary
    }
