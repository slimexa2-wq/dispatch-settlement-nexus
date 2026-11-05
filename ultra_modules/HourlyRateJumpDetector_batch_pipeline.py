import concurrent.futures
import threading
from datetime import datetime
from typing import List, Dict, Any, Optional

class HourlyRateJumpDetectorPipeline:
    def __init__(self, jump_threshold: float = 0.3, default_max_workers: int = 10):
        """
        :param jump_threshold: Threshold ratio for abnormal rate jump (default: 30%)
        """
        self.jump_threshold = jump_threshold
        self.default_max_workers = default_max_workers
        self._lock = threading.Lock()
        self._snapshot = {
            'total': 0,
            'processed': 0,
            'valid': 0,
            'invalid': 0,
            'results': []
        }

    def _parse_date(self, date_val: Any, default: str) -> datetime:
        if not date_val:
            date_val = default
        if isinstance(date_val, datetime):
            return date_val
        try:
            if isinstance(date_val, str):
                date_str = date_val.replace("Z", "+00:00")
                if 'T' not in date_str and len(date_str) == 10:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                else:
                    dt = datetime.fromisoformat(date_str)
                # make offset-naive
                return dt.replace(tzinfo=None)
            return datetime.fromisoformat(default)
        except (ValueError, TypeError):
            return datetime.fromisoformat(default)

    def _parse_float(self, val: Any, default: float = 0.0) -> float:
        if val is None:
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    def _process_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Processes a single record, with robust defaults and self-healing for dirty data.
        """
        if not isinstance(record, dict):
            record = {}

        # Default values and self-healing for missing fields
        project_id_val = record.get('project_id')
        job_role_val = record.get('job_role')
        project_id = str(project_id_val) if project_id_val else 'default_project'
        job_role = str(job_role_val) if job_role_val else 'default_role'

        previous_rate = self._parse_float(record.get('previous_rate'), 0.0)
        current_rate = self._parse_float(record.get('current_rate'), previous_rate)

        policy_start = self._parse_date(record.get('policy_start_date'), '1970-01-01')
        policy_end = self._parse_date(record.get('policy_end_date'), '2099-12-31')
        effective_date = self._parse_date(record.get('effective_date'), datetime.now().strftime("%Y-%m-%d"))

        issues = []

        # 1. Anomaly Jump Check
        if previous_rate > 0:
            jump_ratio = (current_rate - previous_rate) / previous_rate
            if abs(jump_ratio) > self.jump_threshold:
                issues.append(f"Abnormal rate jump: {jump_ratio:.2%} exceeds threshold {self.jump_threshold:.2%}")

        # 2. Policy Validity Bounds Check
        if not (policy_start <= effective_date <= policy_end):
            issues.append("Effective date is out of policy bounds")

        is_valid = len(issues) == 0

        return {
            'input_id': record.get('id', 'unknown'),
            'processed_data': {
                'project_id': project_id,
                'job_role': job_role,
                'previous_rate': previous_rate,
                'current_rate': current_rate,
                'policy_start_date': policy_start.isoformat(),
                'policy_end_date': policy_end.isoformat(),
                'effective_date': effective_date.isoformat(),
            },
            'is_valid': is_valid,
            'issues': issues
        }

    def process_batch(self, records: List[Dict[str, Any]], max_workers: Optional[int] = None) -> Dict[str, Any]:
        """
        High-throughput batch stream processor using concurrent futures.
        Provides zero-blocking execution style by returning the summarized results
        while catching all potential data errors securely.
        """
        if not isinstance(records, list):
            records = []

        max_workers = max_workers or self.default_max_workers

        with self._lock:
            self._snapshot = {
                'total': len(records),
                'processed': 0,
                'valid': 0,
                'invalid': 0,
                'results': []
            }

        if not records:
            return self.get_progress_snapshot()

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Using submit + as_completed for stream-like execution
            future_to_record = {executor.submit(self._process_record, r): r for r in records}

            for future in concurrent.futures.as_completed(future_to_record):
                try:
                    res = future.result()
                except Exception as exc:
                    # Extreme edge-case safety fallback
                    # Ensure input has a robust fallback to dict
                    record_data = future_to_record[future]
                    input_id = record_data.get('id', 'unknown') if isinstance(record_data, dict) else 'unknown'
                    res = {
                        'input_id': input_id,
                        'is_valid': False,
                        'issues': [f"Fatal processing error: {str(exc)}"]
                    }

                results.append(res)

                # Update snapshot
                with self._lock:
                    self._snapshot['processed'] += 1
                    if res.get('is_valid'):
                        self._snapshot['valid'] += 1
                    else:
                        self._snapshot['invalid'] += 1

        with self._lock:
            self._snapshot['results'] = results

        return self.get_progress_snapshot()

    def get_progress_snapshot(self) -> Dict[str, Any]:
        """
        Returns a snapshot of the current pipeline progress for non-blocking UI updates.
        """
        with self._lock:
            return {
                'total': self._snapshot['total'],
                'processed': self._snapshot['processed'],
                'valid': self._snapshot['valid'],
                'invalid': self._snapshot['invalid'],
                'completion_rate': (self._snapshot['processed'] / self._snapshot['total']) if self._snapshot['total'] > 0 else 1.0,
                'results': self._snapshot['results']
            }
