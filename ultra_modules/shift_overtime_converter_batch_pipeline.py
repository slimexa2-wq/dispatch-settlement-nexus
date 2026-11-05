import concurrent.futures
import time
import uuid
from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional, Generator

@dataclass
class JobSnapshot:
    job_id: str
    total_records: int
    processed: int
    successful: int
    failed: int
    status: str  # 'running', 'completed', 'failed'
    start_time: float
    elapsed_time: float

class ShiftOvertimeConverterBatchPipeline:
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=max_workers)
        self.jobs: Dict[str, Dict[str, Any]] = {}

    def _clean_string(self, value: Any, default: str) -> str:
        if value is None:
            return default
        try:
            cleaned = str(value).strip().lower()
            if not cleaned or cleaned in ['null', 'none', 'nan']:
                return default
            return cleaned
        except Exception:
            return default

    def _clean_float(self, value: Any, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            val = float(value)
            return max(0.0, val)
        except (ValueError, TypeError):
            return default

    def process_single_record(self, record: Any) -> Dict[str, Any]:
        """
        Process a single shift record with extreme self-healing and defaults.
        """
        if not isinstance(record, dict):
            return {
                '_status': 'error',
                'error_msg': 'Record must be a dictionary',
                'original_record': str(record)
            }

        # Data Self-Healing and Defaulting
        emp_id = str(record.get('employee_id', '')).strip()
        if not emp_id or emp_id.lower() in ['null', 'none']:
            emp_id = 'UNKNOWN_EMP'

        shift_type = self._clean_string(record.get('shift_type'), 'day')
        if shift_type not in ['day', 'night']:
            shift_type = 'day'

        day_type = self._clean_string(record.get('day_type'), 'normal')
        if day_type not in ['normal', 'weekend', 'holiday']:
            day_type = 'normal'

        regular_hours = self._clean_float(record.get('hours'), 0.0)
        overtime_hours = self._clean_float(record.get('overtime_hours'), 0.0)

        # Apply multiplier logic
        multipliers = {
            'normal': 1.5,
            'weekend': 2.0,
            'holiday': 3.0
        }
        multiplier = multipliers[day_type]

        converted_overtime = overtime_hours * multiplier
        total_equivalent = regular_hours + converted_overtime

        return {
            'employee_id': emp_id,
            'shift_type': shift_type,
            'day_type': day_type,
            'original_hours': round(regular_hours, 2),
            'original_overtime': round(overtime_hours, 2),
            'multiplier': multiplier,
            'converted_overtime_hours': round(converted_overtime, 2),
            'total_equivalent_hours': round(total_equivalent, 2),
            '_status': 'success'
        }

    def _job_worker(self, job_id: str, records: List[Dict[str, Any]]):
        job = self.jobs[job_id]
        results = [None] * len(records)

        # Concurrently process records within the batch
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as record_executor:
            future_to_idx = {
                record_executor.submit(self.process_single_record, r): i
                for i, r in enumerate(records)
            }

            for future in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    res = future.result()
                    if res.get('_status') == 'success':
                        job['successful'] += 1
                    else:
                        job['failed'] += 1
                except Exception as e:
                    res = {'_status': 'error', 'error_msg': str(e)}
                    job['failed'] += 1

                results[idx] = res
                job['processed'] += 1

        job['results'] = results
        job['status'] = 'completed'
        job['end_time'] = time.time()

    def submit_batch(self, records: List[Dict[str, Any]]) -> str:
        """
        Submit a batch of records for processing in the background.
        Returns a job_id for progress tracking and result retrieval.
        """
        job_id = str(uuid.uuid4())
        if not isinstance(records, list):
            records = []

        self.jobs[job_id] = {
            'job_id': job_id,
            'total_records': len(records),
            'processed': 0,
            'successful': 0,
            'failed': 0,
            'status': 'running',
            'start_time': time.time(),
            'end_time': None,
            'results': []
        }

        self.executor.submit(self._job_worker, job_id, records)
        return job_id

    def get_snapshot(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a non-blocking progress snapshot for a given job.
        """
        if job_id not in self.jobs:
            return None

        job = self.jobs[job_id]
        end_time = job['end_time'] or time.time()

        snapshot = JobSnapshot(
            job_id=job_id,
            total_records=job['total_records'],
            processed=job['processed'],
            successful=job['successful'],
            failed=job['failed'],
            status=job['status'],
            start_time=job['start_time'],
            elapsed_time=end_time - job['start_time']
        )
        return asdict(snapshot)

    def get_results(self, job_id: str) -> Optional[List[Dict[str, Any]]]:
        """
        Retrieve results if the job is completed. Returns None if running or not found.
        """
        if job_id not in self.jobs:
            return None
        job = self.jobs[job_id]
        if job['status'] == 'completed':
            return job['results']
        return None

    def process_batch_sync(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Synchronous batch processing for immediate results.
        """
        job_id = self.submit_batch(records)
        while self.jobs[job_id]['status'] == 'running':
            time.sleep(0.01)
        return self.jobs[job_id]['results']

    def stream_process(self, records: List[Dict[str, Any]]) -> Generator[Dict[str, Any], None, None]:
        """
        Stream processing for extremely high throughput without holding all results in memory.
        """
        if not isinstance(records, list):
            return

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [executor.submit(self.process_single_record, r) for r in records]
            for future in concurrent.futures.as_completed(futures):
                try:
                    yield future.result()
                except Exception as e:
                    yield {'_status': 'error', 'error_msg': str(e)}

    def shutdown(self):
        """
        Clean up resources.
        """
        self.executor.shutdown(wait=False)
