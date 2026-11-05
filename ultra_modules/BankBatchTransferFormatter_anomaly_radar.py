import re
import math
from typing import List, Dict, Any, Tuple

class BankBatchTransferFormatter:
    def __init__(self):
        pass

    def validate_luhn(self, card_number: str) -> bool:
        """
        Validates a bank card number using the Luhn algorithm.
        """
        card_number = str(card_number).replace(" ", "").replace("-", "")
        if not card_number.isdigit() or len(card_number) < 13 or len(card_number) > 19:
            return False

        digits = [int(x) for x in card_number]
        odd_digits = digits[-1::-2]
        even_digits = digits[-2::-2]

        checksum = 0
        checksum += sum(odd_digits)

        for d in even_digits:
            checksum += sum([int(x) for x in str(d * 2)])

        return checksum % 10 == 0

    def clean_amount(self, amount: Any) -> float:
        """
        Cleans dirty data in amount fields (e.g. '$1,000.50' or ' 100 ') and falls back to 0.0 if missing.
        """
        if amount is None:
            return 0.0

        if isinstance(amount, (int, float)):
            return float(amount)

        amount_str = str(amount)
        # Keep only digits, dots, and minus signs
        cleaned = re.sub(r'[^\d.-]', '', amount_str)
        try:
            val = float(cleaned)
            return val if not math.isnan(val) else 0.0
        except ValueError:
            return 0.0

    def calculate_stats(self, amounts: List[float]) -> Tuple[float, float, float, float]:
        """
        Calculates mean, std_dev, q1, q3 for Z-score and IQR based anomaly detection.
        """
        if not amounts:
            return 0.0, 0.0, 0.0, 0.0

        n = len(amounts)
        mean = sum(amounts) / n

        variance = sum((x - mean) ** 2 for x in amounts) / n
        std_dev = math.sqrt(variance)

        sorted_amounts = sorted(amounts)
        q1_idx = int(n * 0.25)
        q3_idx = int(n * 0.75)
        q1 = sorted_amounts[q1_idx]
        q3 = sorted_amounts[q3_idx]

        return mean, std_dev, q1, q3

    def process_batch(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Processes a batch of transfer records.
        - Normalizes input fields.
        - Performs Luhn check.
        - Performs statistical analysis on amounts to detect anomalies (Top 3%).
        - Adds extreme simplicity tags: green (normal), yellow (minor warning), red (anomalous).
        """
        processed_records = []
        amounts = []

        for record in records:
            # Missing param fallback
            raw_card = record.get('card_number', '')
            raw_amount = record.get('amount', 0.0)
            raw_name = record.get('name', 'Unknown')

            clean_amount = self.clean_amount(raw_amount)
            amounts.append(clean_amount)

            is_valid_card = self.validate_luhn(raw_card)

            processed_records.append({
                'name': raw_name,
                'card_number': str(raw_card).replace(" ", "").replace("-", ""),
                'amount': clean_amount,
                'is_valid_card': is_valid_card,
                'raw_record': record,
            })

        if not amounts:
            return []

        mean, std_dev, q1, q3 = self.calculate_stats(amounts)
        iqr = q3 - q1

        # We need to flag top 3% extreme values, or based on strict z-score / IQR
        # To simply tag top 3% highest amounts as anomalous (e.g. abnormally high salaries)
        sorted_amounts = sorted(amounts, reverse=True)
        top_3_percent_count = max(1, math.ceil(len(amounts) * 0.03)) if len(amounts) >= 10 else 1

        if len(amounts) >= 10:
            threshold_amount = sorted_amounts[top_3_percent_count - 1]
        else:
            threshold_amount = float('inf')

        for record in processed_records:
            amount = record['amount']
            is_valid = record['is_valid_card']

            status = 'green'
            reason = '正常'

            if not is_valid:
                status = 'red'
                reason = '卡号校验失败(非有效银行卡号)'
            else:
                # Anomaly detection
                z_score = abs((amount - mean) / std_dev) if std_dev > 0 else 0
                is_high_anomaly = False

                if len(amounts) >= 10 and amount >= threshold_amount:
                     is_high_anomaly = True
                elif len(amounts) < 10:
                    if std_dev > 0 and (amount - mean) / std_dev > 1.15: # Must be positive outlier to be an anomaly
                        is_high_anomaly = True
                    elif iqr > 0 and amount > (q3 + 1.5 * iqr):
                        is_high_anomaly = True

                if is_high_anomaly:
                    status = 'red'
                    reason = '金额异常偏高(建议核实)'
                elif z_score > 1.5:
                    status = 'yellow'
                    reason = '金额略高(注意)'

            record['status'] = status
            record['reason'] = reason

        return processed_records
