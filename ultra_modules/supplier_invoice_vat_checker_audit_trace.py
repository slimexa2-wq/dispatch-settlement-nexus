import re
import datetime

class InvoiceVatChecker:
    def __init__(self):
        # Allowable tax rates and their normal form
        self.allowed_rates = {0.06, 0.03, 0.01, 0.05}

    def _clean_amount(self, amount, trace):
        """Silently cleans dirty amount data."""
        if amount is None:
            trace.append("[Fallback] Amount missing, defaulting to 0.0")
            return 0.0

        if isinstance(amount, (int, float)):
            if amount < 0:
                trace.append("[Self-healing] Amount is negative, converting to absolute value")
                return abs(float(amount))
            return float(amount)

        if isinstance(amount, str):
            trace.append("[Self-healing] Amount is string, attempting to parse")
            # Remove whitespace, currency symbols, and commas
            cleaned_str = re.sub(r'[^\d.-]', '', amount)
            try:
                val = float(cleaned_str)
                if val < 0:
                    trace.append("[Self-healing] Parsed amount is negative, converting to absolute value")
                    val = abs(val)
                return val
            except ValueError:
                trace.append(f"[Fallback] Could not parse amount '{amount}', defaulting to 0.0")
                return 0.0

        trace.append("[Fallback] Unsupported amount type, defaulting to 0.0")
        return 0.0

    def _clean_tax_rate(self, rate, trace):
        """Silently cleans and validates tax rate."""
        if rate is None:
            trace.append("[Fallback] Tax rate missing, defaulting to 0.03 (3%)")
            return 0.03

        try:
            val = float(rate)
            # If percentage string was used like "6", it might be passed as 6.0 instead of 0.06
            if val > 1.0:
                trace.append(f"[Self-healing] Tax rate {val} seems to be percentage, dividing by 100")
                val = val / 100.0

            if val not in self.allowed_rates:
                trace.append(f"[Fallback] Tax rate {val} not in allowed rates (6%, 3%, 1%, 5%), defaulting to 0.03")
                return 0.03

            return val
        except (ValueError, TypeError):
            trace.append(f"[Fallback] Invalid tax rate '{rate}', defaulting to 0.03")
            return 0.03

    def _clean_invoice_type(self, inv_type, trace):
        """Silently cleans invoice type."""
        if not inv_type:
            trace.append("[Fallback] Invoice type missing, defaulting to 'general'")
            return 'general'

        cleaned = str(inv_type).strip().lower()
        if 'special' in cleaned or '专' in cleaned:
            return 'special'
        elif 'general' in cleaned or '普' in cleaned:
            return 'general'
        else:
            trace.append(f"[Fallback] Unrecognized invoice type '{inv_type}', defaulting to 'general'")
            return 'general'

    def check_and_calculate(self, raw_data):
        """
        Process invoice data with full self-healing and default fallbacks.
        Returns a clean net result for the frontend, while maintaining an audit trace.
        """
        audit_trace = []
        audit_trace.append(f"[{datetime.datetime.now().isoformat()}] Started VAT check")

        if not isinstance(raw_data, dict):
            audit_trace.append("[Fallback] Input data is not a dictionary, using empty data")
            raw_data = {}

        # 1. Clean and prepare data
        amount = self._clean_amount(raw_data.get('amount'), audit_trace)
        tax_rate = self._clean_tax_rate(raw_data.get('tax_rate'), audit_trace)
        invoice_type = self._clean_invoice_type(raw_data.get('invoice_type'), audit_trace)

        audit_trace.append(f"[Audit] Parsed values - Amount: {amount}, Tax Rate: {tax_rate}, Type: {invoice_type}")

        # 2. Calculate VAT deduction
        deduction_amount = 0.0
        if invoice_type == 'special':
            # For special invoice, VAT can be deducted
            deduction_amount = amount * tax_rate / (1 + tax_rate)
            audit_trace.append(f"[Audit] Special invoice: Calculated deduction as {amount} * {tax_rate} / (1 + {tax_rate}) = {deduction_amount}")
        else:
            # For general invoice, VAT cannot be deducted (usually)
            audit_trace.append("[Audit] General invoice: VAT deduction is 0.0")

        # 3. Prepare final clean result
        result = {
            'original_amount': amount,
            'effective_tax_rate': tax_rate,
            'invoice_type': invoice_type,
            'deductible_vat': round(deduction_amount, 2),
            'net_amount': round(amount - deduction_amount, 2),
            '_audit_trace': audit_trace # Exposed for backend logging, frontend can ignore
        }

        audit_trace.append(f"[{datetime.datetime.now().isoformat()}] Completed VAT check")
        return result
