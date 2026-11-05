import json
import csv
import sys
import datetime
import os
from collections import defaultdict
from typing import List, Dict, Any

class HourlyRateJumpDetector:
    def __init__(self, jump_threshold_ratio: float = 0.2):
        self.jump_threshold_ratio = jump_threshold_ratio

    def _clean_data(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Self-healing and default values for dirty data."""
        cleaned = dict(record)

        cleaned['project'] = str(cleaned.get('project') or 'DEFAULT_PROJECT').strip()
        cleaned['job_title'] = str(cleaned.get('job_title') or 'DEFAULT_JOB').strip()

        try:
            val = cleaned.get('rate')
            cleaned['rate'] = float(val) if val is not None else 0.0
        except (ValueError, TypeError):
            cleaned['rate'] = 0.0

        today = datetime.date.today().isoformat()
        cleaned['date'] = str(cleaned.get('date') or today)
        cleaned['policy_start'] = str(cleaned.get('policy_start') or '2000-01-01')
        cleaned['policy_end'] = str(cleaned.get('policy_end') or '2099-12-31')

        return cleaned

    def detect(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        cleaned_records = [self._clean_data(r) for r in records]

        groups = defaultdict(list)
        for r in cleaned_records:
            groups[(r['project'], r['job_title'])].append(r)

        anomalies = []

        for key, group in groups.items():
            group.sort(key=lambda x: x['date'])

            for i, record in enumerate(group):
                is_anomaly = False
                reasons = []

                if not (record['policy_start'] <= record['date'] <= record['policy_end']):
                    is_anomaly = True
                    reasons.append('DATE_OUT_OF_BOUNDS')

                if i > 0:
                    prev_rate = group[i-1]['rate']
                    curr_rate = record['rate']

                    if prev_rate > 0:
                        jump_ratio = abs(curr_rate - prev_rate) / prev_rate
                        if jump_ratio > self.jump_threshold_ratio:
                            is_anomaly = True
                            reasons.append('RATE_JUMP_DETECTED')

                if is_anomaly:
                    anomaly_record = dict(record)
                    anomaly_record['anomaly_reasons'] = ",".join(reasons)
                    anomalies.append(anomaly_record)

        return anomalies

class OutputAdapter:
    @staticmethod
    def export_json(data: List[Dict[str, Any]], filename: str = 'output.json'):
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def export_excel_csv(data: List[Dict[str, Any]], filename: str = 'output.csv'):
        if not data:
            with open(filename, 'w', encoding='utf-8-sig', newline='') as f:
                f.write('')
            return

        keys = list(data[0].keys())
        with open(filename, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            for row in data:
                writer.writerow(row)

def main():
    synthetic_data = [
        {"project": "ProjA", "job_title": "Engineer", "rate": 100, "date": "2023-01-01", "policy_start": "2023-01-01", "policy_end": "2023-12-31"},
        {"project": "ProjA", "job_title": "Engineer", "rate": 150, "date": "2023-02-01", "policy_start": "2023-01-01", "policy_end": "2023-12-31"},
        {"project": "ProjA", "job_title": "Engineer", "rate": 150, "date": "2024-01-01", "policy_start": "2023-01-01", "policy_end": "2023-12-31"},
        {"project": "ProjB", "job_title": "Designer", "rate": None, "date": "2023-01-01"},
    ]

    detector = HourlyRateJumpDetector()
    anomalies = detector.detect(synthetic_data)

    OutputAdapter.export_json(anomalies, 'anomalies_output.json')
    OutputAdapter.export_excel_csv(anomalies, 'anomalies_output.csv')
    print("Zero-config run complete. Output saved to anomalies_output.json and anomalies_output.csv")

if __name__ == '__main__':
    main()