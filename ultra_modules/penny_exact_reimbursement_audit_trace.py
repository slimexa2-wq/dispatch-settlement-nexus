import decimal

def process_reimbursements(records=None):
    """
    Processes reimbursements by converting amounts from Yuan to Cents without precision loss,
    and deduplicating invoice numbers globally across the batch.
    Maintains an audit trace for backend tracking while returning clean results for the frontend.
    """
    if records is None:
        records = []

    if not isinstance(records, list):
        records = [records]

    audit_trace = []
    seen_invoices = set()
    clean_results = []

    for idx, record in enumerate(records):
        if not isinstance(record, dict):
            audit_trace.append({
                "step": "record_type_fix",
                "index": idx,
                "original_type": str(type(record)),
                "action": "converted_to_empty_dict"
            })
            record = {}

        record_id = record.get("id", f"auto_{idx}")
        raw_amount = record.get("amount_yuan", 0)
        raw_invoices = record.get("invoice_numbers", [])

        # 1. Amount Conversion
        amount_cents = 0
        try:
            if raw_amount is None:
                raise ValueError("None amount")

            # Remove commas if it's a string, e.g., "1,000.50"
            if isinstance(raw_amount, str):
                raw_amount = raw_amount.strip().replace(",", "")
                if not raw_amount:
                    raise ValueError("Empty string amount")

            dec_amount = decimal.Decimal(str(raw_amount))
            if not dec_amount.is_finite():
                raise ValueError("Infinite or NaN amount")

            amount_cents = int((dec_amount * 100).to_integral_value(rounding=decimal.ROUND_HALF_UP))

            audit_trace.append({
                "step": "amount_conversion_success",
                "id": record_id,
                "raw_amount": raw_amount,
                "converted_cents": amount_cents
            })
        except Exception as e:
            audit_trace.append({
                "step": "amount_conversion_fallback",
                "id": record_id,
                "raw_amount": raw_amount,
                "error": str(e),
                "fallback_cents": 0
            })
            amount_cents = 0

        # 2. Invoice Deduplication
        clean_invoices = []
        if raw_invoices is None:
            raw_invoices = []
        elif isinstance(raw_invoices, str) or isinstance(raw_invoices, int):
            raw_invoices = [raw_invoices]
        elif not isinstance(raw_invoices, list):
            audit_trace.append({
                "step": "invoice_type_fix",
                "id": record_id,
                "original_type": str(type(raw_invoices)),
                "action": "converted_to_empty_list"
            })
            raw_invoices = []

        for inv in raw_invoices:
            if inv is None:
                continue

            inv_str = str(inv).strip()
            if not inv_str:
                continue

            if inv_str in seen_invoices:
                audit_trace.append({
                    "step": "invoice_duplicate_removed",
                    "id": record_id,
                    "invoice": inv_str
                })
            else:
                seen_invoices.add(inv_str)
                clean_invoices.append(inv_str)
                audit_trace.append({
                    "step": "invoice_added",
                    "id": record_id,
                    "invoice": inv_str
                })

        clean_results.append({
            "id": record_id,
            "amount_cents": amount_cents,
            "invoice_numbers": clean_invoices
        })

    return {
        "clean_results": clean_results,
        "audit_trace": audit_trace,
        "total_amount_cents": sum(item["amount_cents"] for item in clean_results),
        "total_unique_invoices": len(seen_invoices)
    }
