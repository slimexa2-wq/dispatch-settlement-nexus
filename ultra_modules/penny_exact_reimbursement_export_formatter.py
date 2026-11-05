import csv
import io
import math
import logging
from typing import List, Dict, Any, Tuple

# Configure a basic logger for audit logs (zero-configuration approach)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
# Prevent adding handlers multiple times if module is reloaded
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)

def to_integer_cents(amount_yuan: Any) -> int:
    """Safely converts an amount in yuan (string, float, int) to integer cents."""
    try:
        if amount_yuan is None or amount_yuan == "" or str(amount_yuan).lower() == "nan":
            return 0
        # Convert to float first, then round to 2 decimal places to avoid floating point issues, then to int cents
        return int(round(float(amount_yuan) * 100))
    except (ValueError, TypeError):
        return 0

def format_reimbursement_export(records: List[Dict[str, Any]]) -> Tuple[str, str]:
    """
    Processes reimbursement records, deduplicates invoices, converts amounts to integer cents,
    and returns a CSV string and a short summary report.

    Zero-configuration, automatic fault tolerance: missing keys default to safe values,
    dirty data like NaN/None is sanitized, no side effects outside returning strings.

    Args:
        records: A list of dicts. Expected keys: 'employee_id', 'employee_name', 'amount_yuan', 'invoice_number'

    Returns:
        Tuple[str, str]: (csv_content_string, summary_report_string)
    """
    if not isinstance(records, list):
        records = []
        logger.warning("Input records is not a list. Defaulting to empty list.")

    processed_records = []
    seen_invoices = set()
    total_cents = 0
    valid_count = 0
    duplicate_count = 0

    logger.info(f"Starting processing of {len(records)} reimbursement records.")

    for i, record in enumerate(records):
        if not isinstance(record, dict):
            logger.warning(f"Record at index {i} is not a dictionary. Skipping.")
            continue

        invoice_number = str(record.get("invoice_number", "")).strip()
        # Default empty invoice to a unique one for this record if missing to allow processing,
        # or we could skip. Let's just process without invoice dedup if empty, or we can treat empty as no-invoice.
        # But if invoice is provided and duplicate, we skip.
        if invoice_number and invoice_number in seen_invoices:
            duplicate_count += 1
            logger.info(f"Duplicate invoice detected and skipped: {invoice_number}")
            continue

        if invoice_number:
            seen_invoices.add(invoice_number)

        employee_id = str(record.get("employee_id", "UNKNOWN")).strip()
        if not employee_id or employee_id.lower() == "nan" or employee_id.lower() == "none":
            employee_id = "UNKNOWN"

        employee_name = str(record.get("employee_name", "Unknown")).strip()
        if not employee_name or employee_name.lower() == "nan" or employee_name.lower() == "none":
            employee_name = "Unknown"

        amount_yuan = record.get("amount_yuan", 0)
        cents = to_integer_cents(amount_yuan)

        processed_records.append({
            "employee_id": employee_id,
            "employee_name": employee_name,
            "amount_cents": cents,
            "invoice_number": invoice_number
        })

        total_cents += cents
        valid_count += 1

    logger.info(f"Processing complete. Valid: {valid_count}, Duplicates: {duplicate_count}, Total Cents: {total_cents}")

    # Generate CSV
    output = io.StringIO()
    # Explicitly define headers. Comments=0 means no comment columns, just clean data.
    fieldnames = ["employee_id", "employee_name", "amount_cents", "invoice_number"]
    writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator='\n')

    writer.writeheader()
    writer.writerows(processed_records)

    csv_string = output.getvalue()

    # Generate 3-line report text
    total_yuan = total_cents / 100.0
    report_string = (
        f"Reimbursement Export Summary\n"
        f"Processed {valid_count} valid records (deduplicated {duplicate_count} invoices).\n"
        f"Total Amount: {total_yuan:.2f} Yuan ({total_cents} Cents)."
    )

    return csv_string, report_string
