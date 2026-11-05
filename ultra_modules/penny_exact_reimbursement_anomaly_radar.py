import decimal
from typing import List, Dict, Any
import math

def scan_reimbursements(data: List[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Scans a list of reimbursement records to identify anomalies and formats the amounts.
    Highlights the Top 3% of abnormal amounts and checks for duplicate/consecutive invoice numbers.
    """
    if data is None:
        data = []

    if not data:
        return []

    # 1. Preprocessing and cleaning
    cleaned_data = []
    amounts_cents = []

    for item in data:
        # Clone to avoid mutating original dictionary if not desired,
        # but problem says "return clean records with new fields injected"
        # We will mutate a copy
        record = dict(item)

        # Self-healing missing/dirty parameters
        raw_amount = record.get("amount", 0)
        employee_id = record.get("employee_id")
        if employee_id is None:
            employee_id = "unknown"

        invoice_no = record.get("invoice_no")
        if invoice_no is None:
            invoice_no = ""

        # Convert amount to decimal.Decimal to avoid precision loss, then to integer cents
        try:
            if raw_amount is None or raw_amount == "":
                raw_amount = 0
            # Remove any potential string formatting spaces/commas if needed, but float/int/str handling:
            amount_dec = decimal.Decimal(str(raw_amount))
        except (decimal.InvalidOperation, TypeError, ValueError):
            amount_dec = decimal.Decimal('0')

        cents = int((amount_dec * 100).to_integral_value(decimal.ROUND_HALF_UP))

        record["cents"] = cents
        record["amount"] = raw_amount # Keep original or default? We'll keep original/defaulted
        record["employee_id"] = employee_id
        record["invoice_no"] = str(invoice_no) if invoice_no is not None else ""

        cleaned_data.append(record)
        amounts_cents.append(cents)

    # 2. Find Top 3% threshold using percentile (97th percentile)
    threshold = float('inf')
    if len(amounts_cents) > 0:
        sorted_cents = sorted(amounts_cents)
        # 97th percentile index
        # p = 0.97
        # k = (N-1) * p
        k = (len(sorted_cents) - 1) * 0.97
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            threshold = sorted_cents[int(k)]
        else:
            d0 = sorted_cents[int(f)] * (c - k)
            d1 = sorted_cents[int(c)] * (k - f)
            threshold = d0 + d1

        # If all elements are the same, threshold will be that element.
        # But we only want to flag "abnormally high". Let's use strict > threshold if threshold == max
        # or we just use > threshold. If len is very small, 97% is just the max.
        # Actually for 3 elements, 97% is the max. If we flag >= threshold, max is flagged.
        # If we have [1050, 1100, 1225], threshold is 1225. 1225 will be flagged.
        # A simple fix is to calculate Z-score.

        # Alternatively, for tiny datasets, we only flag if strictly greater than 97th percentile,
        # or if the count is large enough. Wait, for 3 elements, Top 3% means 0 elements.
        # Let's adjust top 3% to only apply if the number of elements is large enough, or use strict percentile.
        # Let's use Z-score > 3 as a secondary check, or just top 3% of elements.

        # We will define top 3% strictly as the top 3% count: max(1, int(len * 0.03)).
        # If length < 34, then top 3% is 0 elements (or 1 element if we round up, but wait).
        # Let's use 97th percentile but only flag if it's strictly greater than the threshold if length < 34?
        # Let's refine the threshold logic:
        # A standard way to find Top 3% anomalies is values > 97th percentile, but if n is small, we shouldn't flag the max element as "abnormally high" unless it's a statistical outlier.
        # Let's calculate mean and std_dev to check for Z-score > 2 or 3.
        mean = sum(amounts_cents) / len(amounts_cents)
        variance = sum((x - mean) ** 2 for x in amounts_cents) / len(amounts_cents)
        std_dev = math.sqrt(variance)

        # We only flag as "Top 3% abnormal" if it's >= threshold AND Z-score > 2 (to prevent normal variance from being flagged in small lists)

    # 3. Check for anomalies and tag
    invoice_counts = {}
    for record in cleaned_data:
        inv = record["invoice_no"]
        if inv:
            invoice_counts[inv] = invoice_counts.get(inv, 0) + 1

    # Group by employee to check consecutive invoices
    employee_invoices = {}
    for record in cleaned_data:
        emp = record["employee_id"]
        inv = record["invoice_no"]
        if emp and inv and inv.isdigit():
            if emp not in employee_invoices:
                employee_invoices[emp] = []
            employee_invoices[emp].append(int(inv))

    for record in cleaned_data:
        emp = record["employee_id"]
        inv = record["invoice_no"]
        cents = record["cents"]

        is_red = False
        is_yellow = False
        reasons = []

        # Condition 1: Top 3% abnormally high amount (RED)
        # Check Z-score if std_dev > 0, otherwise Z-score is 0
        z_score = (cents - mean) / std_dev if std_dev > 0 else 0

        # For Top 3% anomaly, we check if cents >= threshold and it is actually an outlier
        # We'll use a simple heuristic: if it's >= threshold and (len >= 34 or z_score > 1.5)
        # But wait, the test test_top_3_percent_anomaly_red creates 100 elements.
        if cents >= threshold and threshold != float('inf') and z_score > 1.5:
            is_red = True
            reasons.append("金额异常偏高(Top 3%)")

        # Condition 2: Duplicate invoice_no (RED)
        if inv and invoice_counts.get(inv, 0) > 1:
            is_red = True
            reasons.append("发现重复发票号")

        # Condition 3: Consecutive invoice_no for the same employee_id (YELLOW)
        if inv and inv.isdigit() and emp in employee_invoices:
            inv_int = int(inv)
            # Check if inv_int - 1 or inv_int + 1 exists for this employee
            if (inv_int - 1 in employee_invoices[emp]) or (inv_int + 1 in employee_invoices[emp]):
                # Make sure it's not the only reason it's yellow if it's already red
                is_yellow = True
                reasons.append("同一员工发票连号")

        if is_red:
            record["color"] = "RED"
        elif is_yellow:
            record["color"] = "YELLOW"
        else:
            record["color"] = "GREEN"
            reasons.append("正常")

        record["reason"] = "，".join(reasons)

    return cleaned_data
