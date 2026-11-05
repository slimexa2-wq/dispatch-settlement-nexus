import copy
from typing import List, Dict, Any, Tuple
from datetime import datetime

class HourlyRateJumpDetector:
    @staticmethod
    def clean_data(raw_records: Any) -> Tuple[List[Dict[str, Any]], List[str]]:
        audit_trace = []
        cleaned = []

        if not isinstance(raw_records, list):
            audit_trace.append("Input is not a list, using empty list fallback.")
            raw_records = []

        for idx, record in enumerate(raw_records):
            if not isinstance(record, dict):
                audit_trace.append(f"Record {idx} is not a dict, using empty dict fallback.")
                record = {}

            project_id = str(record.get('project_id') or 'unknown_project').strip()
            if not project_id:
                project_id = 'unknown_project'

            job_type = str(record.get('job_type') or 'unknown_job').strip()
            if not job_type:
                job_type = 'unknown_job'

            # Rate parsing
            try:
                rate = float(record.get('rate', 0.0))
                if rate < 0:
                    rate = 0.0
                    audit_trace.append(f"Record {idx} negative rate fixed to 0.0.")
            except (ValueError, TypeError):
                rate = 0.0
                audit_trace.append(f"Record {idx} invalid rate fixed to 0.0.")

            # Date parsing
            start_date_str = record.get('start_date')
            end_date_str = record.get('end_date')

            try:
                start_date = datetime.strptime(str(start_date_str), '%Y-%m-%d')
            except (ValueError, TypeError):
                start_date = datetime.strptime('1970-01-01', '%Y-%m-%d')
                audit_trace.append(f"Record {idx} invalid start_date fixed to 1970-01-01.")

            try:
                end_date = datetime.strptime(str(end_date_str), '%Y-%m-%d')
            except (ValueError, TypeError):
                end_date = datetime.strptime('2099-12-31', '%Y-%m-%d')
                audit_trace.append(f"Record {idx} invalid end_date fixed to 2099-12-31.")

            if start_date > end_date:
                start_date, end_date = end_date, start_date
                audit_trace.append(f"Record {idx} start_date > end_date swapped.")

            cleaned.append({
                'project_id': project_id,
                'job_type': job_type,
                'rate': rate,
                'start_date': start_date,
                'end_date': end_date,
                'original_index': idx
            })

        audit_trace.append(f"Cleaned {len(cleaned)} records successfully.")
        return cleaned, audit_trace

    @staticmethod
    def detect_anomalies(raw_records: Any, jump_threshold: float = 0.3) -> Dict[str, Any]:
        """
        Detects hourly rate jumps and overlapping validity periods.
        jump_threshold: float, representing the percentage of jump (e.g., 0.3 for 30%)
        """
        cleaned, audit_trace = HourlyRateJumpDetector.clean_data(raw_records)
        anomalies = []

        try:
            threshold = float(jump_threshold)
        except (ValueError, TypeError):
            threshold = 0.3
            audit_trace.append("Invalid jump_threshold fixed to 0.3.")

        grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        for record in cleaned:
            key = (record['project_id'], record['job_type'])
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(record)

        for key, records in grouped.items():
            records.sort(key=lambda x: x['start_date'])

            for i in range(1, len(records)):
                prev = records[i-1]
                current = records[i]

                # 1. Overlapping validity period check
                if current['start_date'] <= prev['end_date']:
                    diff_highlight = {
                        'prev_period': f"{prev['start_date'].strftime('%Y-%m-%d')} to {prev['end_date'].strftime('%Y-%m-%d')}",
                        'current_period': f"{current['start_date'].strftime('%Y-%m-%d')} to {current['end_date'].strftime('%Y-%m-%d')}"
                    }
                    anomalies.append({
                        'type': 'overlap',
                        'project_id': key[0],
                        'job_type': key[1],
                        'record_1_index': prev['original_index'],
                        'record_2_index': current['original_index'],
                        'diff_highlight': diff_highlight,
                        'message': "Validity period overlap detected."
                    })
                    audit_trace.append(f"Overlap detected for {key[0]} - {key[1]} between indices {prev['original_index']} and {current['original_index']}.")

                # 2. Rate jump check
                if prev['rate'] > 0:
                    jump = abs(current['rate'] - prev['rate']) / prev['rate']
                elif current['rate'] > 0:
                    jump = float('inf')
                else:
                    jump = 0.0

                if jump > threshold:
                    diff_highlight = {
                        'prev_rate': prev['rate'],
                        'current_rate': current['rate'],
                        'jump_ratio': jump if jump != float('inf') else 'Infinity'
                    }

                    if jump == float('inf'):
                        msg = "Rate jump from 0 detected."
                    else:
                        msg = f"Rate jump of {jump*100:.2f}% detected."

                    anomalies.append({
                        'type': 'rate_jump',
                        'project_id': key[0],
                        'job_type': key[1],
                        'record_1_index': prev['original_index'],
                        'record_2_index': current['original_index'],
                        'diff_highlight': diff_highlight,
                        'message': msg
                    })
                    audit_trace.append(f"Rate jump detected for {key[0]} - {key[1]} between indices {prev['original_index']} and {current['original_index']}.")

        return {
            'anomalies': anomalies,
            'audit_trace': audit_trace
        }
