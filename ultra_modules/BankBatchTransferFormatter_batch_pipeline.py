import re
import concurrent.futures
from typing import List, Dict, Any, Generator, Tuple

class BankBatchTransferFormatter:
    """
    Bank batch transfer formatter pipeline with Luhn validation, data healing,
    and concurrent batch processing.
    """

    @staticmethod
    def luhn_checksum(card_number: str) -> bool:
        """
        Validate a bank card number using the Luhn algorithm.
        """
        if not card_number or not card_number.isdigit():
            return False

        digits = [int(d) for d in str(card_number)]
        checksum = 0
        is_second = False

        for d in reversed(digits):
            if is_second:
                d *= 2
                if d > 9:
                    d -= 9
            checksum += d
            is_second = not is_second

        return checksum % 10 == 0

    @staticmethod
    def clean_card_number(card_number: Any) -> str:
        """
        Clean the card number by removing non-digit characters (dirty data healing).
        """
        if card_number is None:
            return ""
        return re.sub(r'\D', '', str(card_number))

    @staticmethod
    def format_record(record: Dict[str, Any], default_bank: str = "招商银行") -> Dict[str, Any]:
        """
        Format a single transfer record, healing dirty data and applying default values.
        """
        raw_card = record.get('card_number', '')
        cleaned_card = BankBatchTransferFormatter.clean_card_number(raw_card)

        is_valid = BankBatchTransferFormatter.luhn_checksum(cleaned_card)

        return {
            'id': record.get('id', 'unknown'),
            'name': str(record.get('name', '')).strip() or 'Unknown',
            'card_number': cleaned_card,
            'amount': float(record.get('amount', 0.0)),
            'bank': str(record.get('bank', '')).strip() or default_bank,
            'is_valid': is_valid,
            'status': 'ready' if is_valid and cleaned_card else 'invalid_card'
        }

    @staticmethod
    def process_batch_stream(records: List[Dict[str, Any]], max_workers: int = 10) -> Generator[Dict[str, Any], None, None]:
        """
        Process a batch of records concurrently, yielding progress snapshots and results.
        """
        total = len(records)
        if total == 0:
            return

        processed = 0

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Map futures to original record index to maintain some order or tracking if needed
            future_to_record = {
                executor.submit(BankBatchTransferFormatter.format_record, record): record
                for record in records
            }

            for future in concurrent.futures.as_completed(future_to_record):
                try:
                    result = future.result()
                except Exception as exc:
                    original_record = future_to_record[future]
                    result = {
                        'id': original_record.get('id', 'unknown'),
                        'error': str(exc),
                        'status': 'error'
                    }

                processed += 1
                yield {
                    'progress': {
                        'processed': processed,
                        'total': total,
                        'percentage': round((processed / total) * 100, 2)
                    },
                    'result': result
                }

    @staticmethod
    def process_batch(records: List[Dict[str, Any]], max_workers: int = 10) -> Dict[str, Any]:
        """
        Process a batch of records and return the aggregated results.
        """
        results = []
        for snapshot in BankBatchTransferFormatter.process_batch_stream(records, max_workers):
            results.append(snapshot['result'])

        valid_count = sum(1 for r in results if r.get('is_valid', False))

        return {
            'total_processed': len(records),
            'valid_records': valid_count,
            'invalid_records': len(records) - valid_count,
            'results': results
        }
