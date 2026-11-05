import decimal
import time
import re

class GrossMarginReconciler:
    def __init__(self):
        self._history = []

    def _clean_input(self, value):
        if value is None:
            return decimal.Decimal('0.00')
        if isinstance(value, decimal.Decimal):
            return value
        if isinstance(value, (int, float)):
            return decimal.Decimal(str(value))

        # Self-healing for dirty string inputs
        val_str = str(value)
        # Extract the first sequence of numbers, potentially with a decimal point and sign
        match = re.search(r'-?\d+(?:\.\d+)?', val_str.replace(',', ''))
        if match:
            try:
                return decimal.Decimal(match.group(0))
            except decimal.InvalidOperation:
                pass
        return decimal.Decimal('0.00')

    def calculate_gross_margin(self, revenue=None, regular_pay=None, bonus_pay=None, self_recruitment_commission=None):
        revenue_d = self._clean_input(revenue)
        regular_pay_d = self._clean_input(regular_pay)
        bonus_pay_d = self._clean_input(bonus_pay)
        self_recruitment_commission_d = self._clean_input(self_recruitment_commission)

        # 净毛利 = 应收开票 - (同工同酬 + 返费 + 自招提成)
        total_cost = regular_pay_d + bonus_pay_d + self_recruitment_commission_d
        gross_margin = revenue_d - total_cost

        result = {
            'revenue': revenue_d,
            'regular_pay': regular_pay_d,
            'bonus_pay': bonus_pay_d,
            'self_recruitment_commission': self_recruitment_commission_d,
            'gross_margin': gross_margin
        }

        # Snapshot for undo
        snapshot = {
            'timestamp': time.time(),
            'result': result
        }
        self._history.append(snapshot)

        return result

    def undo(self):
        if not self._history:
            return None

        last_snapshot = self._history[-1]
        current_time = time.time()

        if current_time - last_snapshot['timestamp'] <= 5.0:
            self._history.pop() # Remove the undone action
            return last_snapshot['result']

        return None # Expired
