import decimal
import re
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PennyExactReimbursementIntegrationBridge:
    def __init__(self):
        self._processed_invoices = set()

    def process_reimbursements(self, records=None):
        """
        Minimalist zero-configuration interface.
        Takes a single record, list of records, or None.
        Returns a list of processed, standardized records in exact integer cents.
        """
        if records is None:
            return []

        if not isinstance(records, list):
            records = [records]

        results = []
        for record in records:
            if not isinstance(record, dict):
                continue

            processed = self._process_single_record(record)
            if processed:
                results.append(processed)

        return results

    def _process_single_record(self, record):
        # 1. Schema Auto-mapping
        invoice_no = self._extract_invoice_no(record)
        amount_yuan = self._extract_amount(record)

        # 2. Anti-duplication (Invoice Number check)
        if invoice_no:
            if invoice_no in self._processed_invoices:
                logger.warning(f"Duplicate invoice detected and dropped: {invoice_no}")
                return None
            self._processed_invoices.add(invoice_no)
        else:
            # If no invoice number, we can't reliably deduplicate, but we should still process if amount exists
            # We assign a default empty invoice number or keep it null.
            invoice_no = "UNKNOWN_INVOICE"

        # 3. Dirty Data Self-healing & Zero Precision Loss Calculation
        try:
            amount_cents = self._convert_to_exact_cents(amount_yuan)
        except (ValueError, TypeError, decimal.InvalidOperation) as e:
            logger.error(f"Failed to process amount for invoice {invoice_no}: {e}")
            amount_cents = 0 # Default fallback for entirely invalid amounts

        return {
            "invoice_number": invoice_no,
            "reimbursement_amount_cents": amount_cents
        }

    def _extract_invoice_no(self, record):
        # Auto-map common historical/new fields
        fields = ['invoice_no', 'invoiceNumber', 'invoice_id', 'inv_no']
        for field in fields:
            if field in record and record[field]:
                return str(record[field]).strip()
        return None

    def _extract_amount(self, record):
        fields = ['amount_yuan', 'amount', 'money', 'reimbursement_amount']
        for field in fields:
            if field in record and record[field] is not None:
                return record[field]
        return 0 # Default fallback

    def _convert_to_exact_cents(self, amount_yuan):
        if amount_yuan is None or amount_yuan == "":
            return 0

        if isinstance(amount_yuan, (int, float)):
             amount_yuan = str(amount_yuan)

        # Self-healing: remove currency symbols, spaces, commas
        if isinstance(amount_yuan, str):
            # Keep only digits, minus sign, and dot
            cleaned_str = re.sub(r'[^\d\.-]', '', amount_yuan)
            if not cleaned_str:
                return 0
            amount_yuan = cleaned_str

        # Use Decimal for exact precision conversion
        decimal_yuan = decimal.Decimal(amount_yuan)
        cents = int((decimal_yuan * 100).to_integral_value(rounding=decimal.ROUND_HALF_UP))
        return cents
