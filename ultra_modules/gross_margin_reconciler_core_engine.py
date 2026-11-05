def _safe_float(value) -> float:
    """
    Safely convert a value to float.
    Defaults to 0.0 if the value is missing, None, or invalid.
    """
    if value is None:
        return 0.0
    try:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return 0.0
            # Handle comma separated numbers gracefully
            value = value.replace(',', '')
        return float(value)
    except (ValueError, TypeError):
        return 0.0

def calculate_gross_margin(invoice_amount=0.0, equal_pay=0.0, return_fee=0.0, recruitment_commission=0.0) -> float:
    """
    Calculate the net gross margin for a dispatch outsourcing project.

    Formula:
    Net Gross Margin = Invoice Amount (应收开票) - Equal Pay (同工同酬) - Return Fee (返费) - Recruitment Commission (自招提成)

    Args:
        invoice_amount: 应收开票
        equal_pay: 同工同酬
        return_fee: 返费
        recruitment_commission: 自招提成

    Returns:
        float: The calculated net gross margin.
    """
    # Clean inputs
    safe_invoice_amount = _safe_float(invoice_amount)
    safe_equal_pay = _safe_float(equal_pay)
    safe_return_fee = _safe_float(return_fee)
    safe_recruitment_commission = _safe_float(recruitment_commission)

    # Calculate net gross margin
    net_gross_margin = safe_invoice_amount - safe_equal_pay - safe_return_fee - safe_recruitment_commission

    # Return rounded to 2 decimal places to avoid floating point issues
    return round(net_gross_margin, 2)
