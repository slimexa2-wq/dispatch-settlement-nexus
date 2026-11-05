import concurrent.futures
import math
from typing import List, Dict, Any

class ResignedWorkerPayHoldPipeline:
    """
    A high-throughput batch processing pipeline for resigned/absentee workers' pay hold and settlement.
    Features auto-healing for dirty data, compliance checks for penalty limits, and concurrent processing.
    """

    def __init__(self, max_workers: int = 20):
        self.max_workers = max_workers
        # Maximum allowed penalty for sudden resignation is 20% of the accrued base pay.
        self.MAX_PENALTY_RATIO = 0.20

    def _clean_data(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Auto-heals missing, null, or dirty data, supplying reasonable defaults
        so that processing never completely halts due to a single bad record.
        """
        if not isinstance(record, dict):
            record = {}

        worker_id = str(record.get('worker_id', 'UNKNOWN')).strip()
        if not worker_id or worker_id.lower() in ('null', 'none'):
            worker_id = 'UNKNOWN'

        try:
            base_salary = float(record.get('base_salary', 0.0))
            if math.isnan(base_salary) or base_salary < 0:
                base_salary = 0.0
        except (ValueError, TypeError):
            base_salary = 0.0

        try:
            penalty = float(record.get('requested_penalty', 0.0))
            if math.isnan(penalty) or penalty < 0:
                penalty = 0.0
        except (ValueError, TypeError):
            penalty = 0.0

        try:
            # We treat any truthy value or specific strings as True for abrupt resignation
            raw_abrupt = record.get('is_abrupt_resignation', False)
            if isinstance(raw_abrupt, str):
                is_abrupt_resignation = raw_abrupt.lower() in ('true', '1', 'yes', 'y')
            else:
                is_abrupt_resignation = bool(raw_abrupt)
        except Exception:
            is_abrupt_resignation = False

        return {
            'worker_id': worker_id,
            'base_salary': base_salary,
            'requested_penalty': penalty,
            'is_abrupt_resignation': is_abrupt_resignation,
            'original_record': record
        }

    def _process_single_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a single worker's record for compliance and final pay calculation.
        """
        try:
            cleaned = self._clean_data(record)
            accrued_pay = cleaned['base_salary']

            actual_penalty = 0.0
            if cleaned['is_abrupt_resignation']:
                # Ensure the penalty doesn't exceed the compliance limit
                max_penalty = accrued_pay * self.MAX_PENALTY_RATIO
                actual_penalty = min(cleaned['requested_penalty'], max_penalty)

            final_pay = accrued_pay - actual_penalty

            return {
                'worker_id': cleaned['worker_id'],
                'accrued_pay': accrued_pay,
                'requested_penalty': cleaned['requested_penalty'],
                'applied_penalty': actual_penalty,
                'final_pay': max(0.0, final_pay),
                'status': 'SUCCESS',
                'error': None
            }
        except Exception as e:
            # Absolute fallback to ensure thread doesn't crash the pool silently
            return {
                'worker_id': str(record.get('worker_id', 'ERROR')),
                'accrued_pay': 0.0,
                'requested_penalty': 0.0,
                'applied_penalty': 0.0,
                'final_pay': 0.0,
                'status': 'FAILURE',
                'error': str(e)
            }

    def process_batch(self, records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Process a batch of worker records concurrently.
        Supports processing large batches (e.g., 10~1000 records).
        Returns aggregated non-blocking summary and list of all detailed results.
        """
        if not records:
            return {
                'total_processed': 0,
                'success_count': 0,
                'failure_count': 0,
                'results': []
            }

        results = []
        success_count = 0
        failure_count = 0

        # ThreadPoolExecutor provides non-blocking style execution map
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_record = {executor.submit(self._process_single_record, r): r for r in records}

            for future in concurrent.futures.as_completed(future_to_record):
                result = future.result()
                results.append(result)
                if result['status'] == 'SUCCESS':
                    success_count += 1
                else:
                    failure_count += 1

        return {
            'total_processed': len(records),
            'success_count': success_count,
            'failure_count': failure_count,
            # Return sorted by worker_id to maintain some determinism if needed,
            # though as_completed returns in arbitrary order. We will return as-is.
            'results': results
        }
