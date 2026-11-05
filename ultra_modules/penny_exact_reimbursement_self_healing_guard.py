import time
import copy
import re

class PennyExactReimbursementGuard:
    def __init__(self):
        self.snapshots = {}
        self.processed_invoices = set()

    def process_reimbursement(self, request_data):
        if not isinstance(request_data, dict):
            request_data = {}

        process_id = request_data.get("process_id", str(time.time()))
        amount_input = request_data.get("amount", 0)
        invoice_no = request_data.get("invoice_no", "")

        # 1. Heal amount (silently handle dirty data)
        cents_amount = self._heal_amount(amount_input)

        # 2. Validate invoice
        is_valid, invoice_result = self._validate_invoice(invoice_no)

        status = "SUCCESS"
        if not is_valid:
            # For simplicity, if invalid invoice, we still return a response but flag as failed
            status = "FAILED_" + invoice_result
            final_invoice = None
        else:
            final_invoice = invoice_result
            self.processed_invoices.add(final_invoice)

        # 3. Prepare response
        result_data = {
            "process_id": process_id,
            "cents_amount": cents_amount,
            "invoice_no": final_invoice,
            "status": status
        }

        # 4. Create snapshot for 5-second undo window
        self._create_snapshot(process_id, {
            "request": request_data,
            "result": result_data,
            "added_invoice": final_invoice if status == "SUCCESS" else None
        })

        return result_data

    def _heal_amount(self, amount):
        if amount is None:
            return 0

        if isinstance(amount, (int, float)):
            val = float(amount)
        elif isinstance(amount, str):
            # Try to convert directly first (handles scientific notation like '1e9')
            try:
                val = float(amount)
            except ValueError:
                # Remove whitespace, currency symbols, commas (but keep 'e' or 'E' for scientific notation)
                cleaned = re.sub(r'[^\d.eE-]', '', amount)
                if not cleaned:
                    return 0
                try:
                    val = float(cleaned)
                except ValueError:
                    return 0
        else:
            return 0

        if val < 0:
            val = 0

        # Convert to integer cents (round to handle float precision)
        return int(round(val * 100))

    def _validate_invoice(self, invoice_no):
        if not invoice_no or not isinstance(invoice_no, str):
            return False, "INVALID_FORMAT"

        # Clean the invoice number (remove whitespace)
        cleaned_invoice = invoice_no.strip()
        if not cleaned_invoice:
            return False, "EMPTY_INVOICE"

        if cleaned_invoice in self.processed_invoices:
            return False, "DUPLICATE"

        return True, cleaned_invoice

    def _create_snapshot(self, process_id, data):
        self.snapshots[process_id] = {
            "timestamp": time.time(),
            "data": copy.deepcopy(data)
        }

    def undo(self, process_id):
        if process_id not in self.snapshots:
            return False, "SNAPSHOT_NOT_FOUND"

        snapshot = self.snapshots[process_id]
        current_time = time.time()

        # Check if within 5-second window
        if current_time - snapshot["timestamp"] > 5.0:
            return False, "UNDO_EXPIRED"

        # Perform undo: remove invoice if it was added
        added_invoice = snapshot["data"].get("added_invoice")
        if added_invoice and added_invoice in self.processed_invoices:
            self.processed_invoices.remove(added_invoice)

        # Invalidate snapshot after undo
        del self.snapshots[process_id]

        return True, "UNDO_SUCCESS"
