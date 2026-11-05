import json
import csv
import io
import decimal
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

class ReimbursementProcessor:
    def __init__(self):
        self.processed_invoices = set()
        # Initialize context for exact decimal operations
        decimal.getcontext().rounding = decimal.ROUND_HALF_UP

    def sanitize_amount(self, amount):
        """Sanitizes dirty data to clean decimal amount."""
        if amount is None:
            return decimal.Decimal('0.00')
        if isinstance(amount, (int, float)):
            amount = str(amount)
        if isinstance(amount, str):
            # Self-healing: remove spaces, commas, $ signs
            amount = amount.replace(' ', '').replace(',', '').replace('$', '')
            try:
                # Attempt to parse
                parsed_amount = decimal.Decimal(amount)
                # Keep it at two decimal places maximum and round to nearest cent
                parsed_amount = parsed_amount.quantize(decimal.Decimal('0.00'))
                return parsed_amount
            except (decimal.InvalidOperation, TypeError):
                logging.warning(f"Failed to parse amount '{amount}'. Defaulting to 0.00.")
                return decimal.Decimal('0.00')

        logging.warning(f"Invalid amount type '{type(amount)}'. Defaulting to 0.00.")
        return decimal.Decimal('0.00')

    def convert_to_cents(self, amount_yuan):
        """Converts Yuan amount to integer cents to avoid precision loss."""
        sanitized_amount = self.sanitize_amount(amount_yuan)
        cents = int((sanitized_amount * decimal.Decimal('100')).quantize(decimal.Decimal('1')))
        return cents

    def process_reimbursement(self, employee_id=None, invoice_number=None, amount_yuan=None):
        """
        Process a single reimbursement.
        Zero-parameter fallback: if arguments are missing, supplies reasonable defaults.
        """
        # Zero-parameter fallback & reasonable defaults
        employee_id = employee_id if employee_id is not None else "EMP_000000"
        invoice_number = invoice_number if invoice_number is not None else "INV_DEFAULT_01"
        amount_yuan = amount_yuan if amount_yuan is not None else "12.34"

        if invoice_number in self.processed_invoices:
            logging.error(f"Duplicate invoice detected: {invoice_number}. Rejecting processing.")
            return {
                "status": "error",
                "message": "duplicate_invoice",
                "employee_id": employee_id,
                "invoice_number": invoice_number,
                "amount_cents": 0
            }

        self.processed_invoices.add(invoice_number)
        cents = self.convert_to_cents(amount_yuan)

        return {
            "status": "success",
            "employee_id": employee_id,
            "invoice_number": invoice_number,
            "amount_cents": cents,
            "amount_yuan": str(self.sanitize_amount(amount_yuan))
        }


class Adapter:
    @staticmethod
    def to_json(data):
        """Dual-mode adapter: output to JSON."""
        return json.dumps(data, indent=2, ensure_ascii=False)

    @staticmethod
    def to_excel_csv(data):
        """Dual-mode adapter: output to CSV format string (for Excel compatibility)."""
        output = io.StringIO()
        if not data:
            return ""

        # If it's a single dict, wrap in list for generic processing
        if isinstance(data, dict):
            data = [data]

        if not data:
            return ""

        keys = list(data[0].keys())
        writer = csv.DictWriter(output, fieldnames=keys)
        writer.writeheader()
        for row in data:
            writer.writerow(row)

        return output.getvalue()


def main():
    """
    Zero-parameter CLI entrypoint.
    Demonstrates processing default dummy data.
    """
    print("=== Penny Exact Reimbursement CLI ===")

    processor = ReimbursementProcessor()

    # 1. Zero-parameter invocation
    print("\n[Test 1] Zero-parameter invocation (default fallback):")
    result_default = processor.process_reimbursement()
    print("JSON Output:")
    print(Adapter.to_json(result_default))
    print("CSV Output:")
    print(Adapter.to_excel_csv(result_default))

    # 2. Duplicate invoice handling
    print("\n[Test 2] Duplicate invoice handling:")
    result_duplicate = processor.process_reimbursement(invoice_number="INV_DEFAULT_01")
    print(Adapter.to_json(result_duplicate))

    # 3. Dirty data self-healing
    print("\n[Test 3] Dirty data self-healing (amount: ' $ 1,234.567  '):")
    result_dirty = processor.process_reimbursement(
        employee_id="EMP_123456",
        invoice_number="INV_2023_002",
        amount_yuan=" $ 1,234.567  "
    )
    print(Adapter.to_json(result_dirty))


if __name__ == "__main__":
    main()
