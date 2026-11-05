import concurrent.futures
from typing import List, Dict, Any

class AdvanceLoanDeductionGuardBatchPipeline:
    """
    Worker Weekly Advance / Living Allowance Automatic Deduction Guard.
    Ensures that deductions do not exceed the actual monthly salary.
    Supports high throughput batch stream processing (10~1000 records).
    Implements dirty data healing, missing param defaults, and extreme boundary fallbacks.
    """

    def __init__(self, max_concurrency: int = 20):
        self.max_concurrency = max_concurrency

    def _heal_and_parse(self, raw_data: Any) -> Dict[str, Any]:
        """
        Heals dirty data and provides defaults for missing parameters.
        Zero configuration tolerance.
        """
        # Ensure it's a dict for safe processing
        if not isinstance(raw_data, dict):
            raw_data = {}

        worker_id = str(raw_data.get('worker_id', 'UNKNOWN_WORKER')).strip()
        if not worker_id or worker_id == 'None':
            worker_id = 'UNKNOWN_WORKER'

        def safe_float(val, default=0.0):
            try:
                if val is None:
                    return default
                res = float(val)
                # Auto heal negative values to 0
                return max(0.0, res)
            except (ValueError, TypeError):
                return default

        monthly_salary = safe_float(raw_data.get('monthly_salary'))
        advance_loan = safe_float(raw_data.get('advance_loan'))

        return {
            'worker_id': worker_id,
            'monthly_salary': monthly_salary,
            'advance_loan': advance_loan
        }

    def _process_record(self, raw_data: Any) -> Dict[str, Any]:
        """
        Processes a single worker's deduction record.
        Ensures the deduction does not cause negative actual payment.
        """
        try:
            healed = self._heal_and_parse(raw_data)
            salary = healed['monthly_salary']
            loan = healed['advance_loan']

            # The core guard logic: deduction cannot exceed salary
            final_deduction = min(salary, loan)
            actual_payment = salary - final_deduction

            return {
                'worker_id': healed['worker_id'],
                'monthly_salary': salary,
                'advance_loan': loan,
                'final_deduction': final_deduction,
                'actual_payment': actual_payment,
                'status': 'success',
                'error_msg': None
            }
        except Exception as e:
            # Extreme boundary fallback to ensure pipeline never crashes
            return {
                'worker_id': 'UNKNOWN_ERROR',
                'monthly_salary': 0.0,
                'advance_loan': 0.0,
                'final_deduction': 0.0,
                'actual_payment': 0.0,
                'status': 'error',
                'error_msg': str(e)
            }

    def run_batch(self, batch_data: List[Any]) -> Dict[str, Any]:
        """
        Runs the batch pipeline concurrently.
        """
        if not isinstance(batch_data, list):
            return {
                'total_processed': 0,
                'successful': 0,
                'failed': 0,
                'results': [],
                'error': 'Input must be a list of records'
            }

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_concurrency) as executor:
            futures = [executor.submit(self._process_record, item) for item in batch_data]

            for future in concurrent.futures.as_completed(futures):
                results.append(future.result())

        # Aggregate results non-blocking
        successful = sum(1 for r in results if r['status'] == 'success')
        failed = sum(1 for r in results if r['status'] == 'error')

        return {
            'total_processed': len(results),
            'successful': successful,
            'failed': failed,
            'results': results
        }
