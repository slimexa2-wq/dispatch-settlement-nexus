import time
import uuid

class VATCheckerGuard:
    def __init__(self):
        # Format: { "snapshot_id": { "timestamp": float, "data": dict } }
        self._snapshots = {}
        self._snapshot_ttl = 5.0  # 5 seconds

    def _clean_numeric(self, val):
        if val is None:
            return 0.0
        try:
            v = float(val)
            return v if v >= 0 else 0.0
        except (ValueError, TypeError):
            return 0.0

    def _clean_rate(self, rate):
        if rate is None:
            return 0.0
        try:
            if isinstance(rate, str):
                rate = rate.replace('%', '')
            r = float(rate)
            # normalize rates if user passes 6 instead of 0.06
            if r > 1.0:
                r = r / 100.0

            # Supported rates: 6%, 3%, 1%, and 5% (difference method)
            valid_rates = [0.06, 0.03, 0.01, 0.05, 0.0]

            # find closest valid rate
            closest = min(valid_rates, key=lambda x: abs(x - r))
            return closest
        except (ValueError, TypeError):
            return 0.0

    def calculate_deduction(self, invoice_data=None):
        if invoice_data is None:
            invoice_data = {}

        inclusive_amount = self._clean_numeric(invoice_data.get('inclusive_amount'))
        rate = self._clean_rate(invoice_data.get('rate'))
        is_difference = bool(invoice_data.get('is_difference', False))
        difference_deduction = self._clean_numeric(invoice_data.get('difference_deduction', 0.0))
        invoice_type = str(invoice_data.get('type', 'special')).lower() # 'special' or 'normal'

        # fallback: normal invoices can't be deducted usually, but let's assume special as fallback for missing type
        # In reality, this requires business rules.
        # Let's say:
        # - special: can deduct
        # - normal: can't deduct (deduction = 0) unless there are specific rules, but here let's simplify.

        # Self-healing boundary condition:
        if inclusive_amount < difference_deduction:
            difference_deduction = inclusive_amount

        deductible_amount = 0.0
        tax_amount = 0.0

        if invoice_type != 'normal':
            if is_difference and rate == 0.05:
                # Difference method (usually 5%)
                taxable_amount = inclusive_amount - difference_deduction
                tax_amount = (taxable_amount / (1 + rate)) * rate
            else:
                # Standard method
                tax_amount = (inclusive_amount / (1 + rate)) * rate
            deductible_amount = tax_amount
        else:
            # Normal invoices typically don't have input VAT deductions
            deductible_amount = 0.0
            tax_amount = 0.0

        result_data = {
            'inclusive_amount': inclusive_amount,
            'rate': rate,
            'is_difference': is_difference,
            'difference_deduction': difference_deduction,
            'type': invoice_type,
            'deductible_tax': round(deductible_amount, 2),
            'calculated_tax': round(tax_amount, 2)
        }

        # Create a snapshot for potential Undo
        snapshot_id = str(uuid.uuid4())
        self._snapshots[snapshot_id] = {
            'timestamp': time.time(),
            'data': result_data
        }

        return {
            'result': result_data,
            'snapshot_id': snapshot_id
        }

    def undo(self, snapshot_id):
        if not snapshot_id or snapshot_id not in self._snapshots:
            return None

        snapshot = self._snapshots[snapshot_id]
        current_time = time.time()

        if current_time - snapshot['timestamp'] > self._snapshot_ttl:
            # Snapshot expired, silently fail
            del self._snapshots[snapshot_id]
            return None

        # Successful undo, return the original calculated result for reference/restore
        data = snapshot['data']
        del self._snapshots[snapshot_id]
        return data

# Singleton-like instance if module level access is preferred
checker = VATCheckerGuard()
