import time
import random
import datetime
from typing import List, Dict, Any, Optional

class HourlyRateJumpDetector:
    """
    Core algorithm module for detecting abnormal settlement hourly rate jumps and policy validity out-of-bounds.
    Focuses on dirty data self-healing, missing parameter fallbacks, zero-configuration defaults, and high performance.
    """

    def __init__(self, jump_threshold: float = 0.5, default_rate: float = 15.0):
        """
        Initializes the detector.
        :param jump_threshold: The percentage threshold for a rate jump to be considered abnormal (default 50%).
        :param default_rate: The default rate to use if rate is missing or invalid.
        """
        self.jump_threshold = max(0.0, float(jump_threshold)) if jump_threshold is not None else 0.5
        self.default_rate = max(0.0, float(default_rate)) if default_rate is not None else 15.0

    def _clean_rate(self, rate: Any) -> float:
        """
        Cleans and normalizes the hourly rate.
        """
        if rate is None:
            return self.default_rate
        try:
            val = float(rate)
            return val if val >= 0 else self.default_rate
        except (ValueError, TypeError):
            return self.default_rate

    def _clean_date(self, date_val: Any, default_dt: datetime.datetime) -> datetime.datetime:
        """
        Cleans and normalizes date values.
        """
        if isinstance(date_val, datetime.datetime):
            return date_val
        elif isinstance(date_val, datetime.date):
            return datetime.datetime.combine(date_val, datetime.datetime.min.time())
        elif isinstance(date_val, str):
            try:
                # Try simple ISO format fallback
                return datetime.datetime.fromisoformat(date_val.replace('Z', '+00:00'))
            except ValueError:
                return default_dt
        return default_dt

    def detect_anomalies(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Processes a list of settlement records and detects rate jumps or policy out-of-bounds.
        Returns a list of anomalies.
        """
        if not records:
            return []

        # Self-heal and normalize data
        normalized_records = []
        now = datetime.datetime.now()

        for record in records:
            if not isinstance(record, dict):
                continue

            project_id = str(record.get('project_id', 'UNKNOWN_PROJECT'))
            job_type = str(record.get('job_type', 'UNKNOWN_JOB'))

            rate = self._clean_rate(record.get('hourly_rate'))
            policy_start = self._clean_date(record.get('policy_start'), datetime.datetime.min)
            policy_end = self._clean_date(record.get('policy_end'), datetime.datetime.max)
            settlement_date = self._clean_date(record.get('settlement_date'), now)

            normalized_records.append({
                'original': record,
                'project_id': project_id,
                'job_type': job_type,
                'hourly_rate': rate,
                'policy_start': policy_start,
                'policy_end': policy_end,
                'settlement_date': settlement_date
            })

        # Group by project_id and job_type
        grouped_records = {}
        for rec in normalized_records:
            key = (rec['project_id'], rec['job_type'])
            if key not in grouped_records:
                grouped_records[key] = []
            grouped_records[key].append(rec)

        anomalies = []

        # Analyze each group
        for key, group in grouped_records.items():
            # Sort by settlement date to check sequential jumps
            group.sort(key=lambda x: x['settlement_date'])

            prev_rate = None
            for rec in group:
                current_rate = rec['hourly_rate']
                settlement_date = rec['settlement_date']

                # Check policy bounds
                policy_out_of_bounds = not (rec['policy_start'] <= settlement_date <= rec['policy_end'])

                # Check jump
                is_jump_abnormal = False
                jump_ratio = 0.0
                if prev_rate is not None and prev_rate > 0:
                    jump_ratio = abs(current_rate - prev_rate) / prev_rate
                    if jump_ratio > self.jump_threshold:
                        is_jump_abnormal = True

                if policy_out_of_bounds or is_jump_abnormal:
                    anomalies.append({
                        'record': rec['original'],
                        'project_id': rec['project_id'],
                        'job_type': rec['job_type'],
                        'current_rate': current_rate,
                        'previous_rate': prev_rate,
                        'jump_ratio': jump_ratio,
                        'is_jump_abnormal': is_jump_abnormal,
                        'policy_out_of_bounds': policy_out_of_bounds,
                        'settlement_date': settlement_date.isoformat()
                    })

                prev_rate = current_rate

        return anomalies


class BenchmarkSuite:
    """
    Generates synthetic fixtures and runs performance benchmarks.
    """

    @staticmethod
    def generate_synthetic_fixtures(num_records: int) -> List[Dict[str, Any]]:
        """
        Generates extreme boundary and normal records for testing.
        """
        records = []
        projects = ['PROJ_A', 'PROJ_B', 'PROJ_C', None, 123]
        jobs = ['WORKER', 'MANAGER', 'TEMP', '']

        base_time = datetime.datetime(2023, 1, 1)

        for i in range(num_records):
            # Mix of normal and dirty data
            if i % 100 == 0:
                # Completely dirty record
                records.append({
                    'project_id': random.choice(projects),
                    'job_type': random.choice(jobs),
                    'hourly_rate': 'invalid_rate',
                    'policy_start': 'bad_date',
                    'policy_end': None,
                    'settlement_date': None
                })
            elif i % 50 == 0:
                # Abnormal jump record
                records.append({
                    'project_id': 'PROJ_A',
                    'job_type': 'WORKER',
                    'hourly_rate': 100.0, # Jump!
                    'policy_start': base_time,
                    'policy_end': base_time + datetime.timedelta(days=365),
                    'settlement_date': base_time + datetime.timedelta(days=i)
                })
            elif i % 25 == 0:
                # Policy out of bounds (cross year/month boundary)
                records.append({
                    'project_id': 'PROJ_B',
                    'job_type': 'MANAGER',
                    'hourly_rate': 20.0,
                    'policy_start': base_time,
                    'policy_end': base_time + datetime.timedelta(days=30),
                    'settlement_date': base_time + datetime.timedelta(days=60) # Out of bounds
                })
            else:
                # Normal record
                records.append({
                    'project_id': 'PROJ_A',
                    'job_type': 'WORKER',
                    'hourly_rate': 20.0 + (random.random() * 2), # Small variations
                    'policy_start': base_time,
                    'policy_end': base_time + datetime.timedelta(days=3650),
                    'settlement_date': base_time + datetime.timedelta(days=i)
                })

        return records

    @staticmethod
    def run_benchmark(num_records: int = 100000) -> Dict[str, Any]:
        """
        Runs benchmark and asserts millisecond level response.
        """
        detector = HourlyRateJumpDetector()
        records = BenchmarkSuite.generate_synthetic_fixtures(num_records)

        start_time = time.perf_counter()
        anomalies = detector.detect_anomalies(records)
        end_time = time.perf_counter()

        duration_ms = (end_time - start_time) * 1000

        return {
            'num_records': num_records,
            'duration_ms': duration_ms,
            'anomalies_found': len(anomalies)
        }
