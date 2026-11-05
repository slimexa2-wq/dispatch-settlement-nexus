import decimal
import re

def parse_amount_to_cents(amount_yuan):
    """
    Converts a Yuan amount to integer cents.
    Handles dirty data silently, missing parameters fallback to 0.
    """
    if amount_yuan is None:
        return 0

    amount_str = str(amount_yuan)

    # Dirty data silent cleaning: remove currency symbols, commas, spaces
    amount_str = re.sub(r'[¥$,\s]', '', amount_str)

    if not amount_str:
        return 0

    try:
        # Using decimal to avoid float imprecision issues
        decimal_val = decimal.Decimal(amount_str)
        # Round to 2 decimal places, then multiply by 100
        cents = int(decimal_val.quantize(decimal.Decimal('0.00'), rounding=decimal.ROUND_HALF_UP) * 100)
        return cents
    except decimal.InvalidOperation:
        # Fallback for completely invalid data
        return 0

def process_reimbursements(records):
    """
    Processes a list of reimbursement records.
    Features:
    - Default empty list for missing parameters.
    - Filters out duplicate invoice numbers silently.
    - Parses amounts to integer cents.
    Returns:
    - total_cents: Sum of all valid processed records.
    - processed_records: The de-duplicated and parsed records.
    """
    if not records:
        return {"total_cents": 0, "processed_records": []}

    seen_invoices = set()
    processed_records = []
    total_cents = 0

    for record in records:
        if not isinstance(record, dict):
            continue

        invoice_no = record.get('invoice_no')

        # Silent de-duplication
        if invoice_no:
            # Clean invoice_no in case of dirty data
            invoice_no = str(invoice_no).strip()
            if invoice_no in seen_invoices:
                continue
            seen_invoices.add(invoice_no)
        else:
            # Missing invoice_no is treated as a record without one,
            # we can allow it or skip it. For a reimbursement, we might allow it
            # if no invoice is strictly required, but usually 'invoice_no' deduplication
            # implies it's tracked. Let's allow them but not track them as duplicates.
            pass

        raw_amount = record.get('amount')
        cents = parse_amount_to_cents(raw_amount)

        processed_records.append({
            "invoice_no": invoice_no,
            "cents": cents,
            "original_amount": raw_amount
        })

        total_cents += cents

    return {
        "total_cents": total_cents,
        "processed_records": processed_records
    }
