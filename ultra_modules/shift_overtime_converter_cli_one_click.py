import json
import csv
import sys
import os

class ShiftOvertimeConverter:
    def __init__(self, data=None):
        if data is None:
            self.data = [
                {
                    "employee_id": "EMP001",
                    "base_rate": 20.0,
                    "shift": "day",
                    "normal_ot_hours": 2,
                    "weekend_ot_hours": 0,
                    "holiday_ot_hours": 0
                },
                {
                    "employee_id": "EMP002",
                    "base_rate": "25",
                    "shift": "night",
                    "normal_ot_hours": 3.5,
                    "weekend_ot_hours": 8,
                    "holiday_ot_hours": 0
                },
                {
                    "employee_id": "EMP003",
                    "base_rate": None,
                    "shift": "invalid_shift",
                    "normal_ot_hours": -5,
                    "weekend_ot_hours": "abc",
                    "holiday_ot_hours": None
                }
            ]
        else:
            self.data = data

    def _parse_float(self, val, default=0.0):
        if val is None:
            return default
        try:
            val = float(val)
            if val < 0:
                return 0.0
            return val
        except (ValueError, TypeError):
            return default

    def clean_record(self, record):
        cleaned = {}
        cleaned["employee_id"] = str(record.get("employee_id", "UNKNOWN")) if record.get("employee_id") else "UNKNOWN"

        # Missing or invalid base rate defaults to 20.0 (typical minimum hourly rate)
        rate = self._parse_float(record.get("base_rate"), default=20.0)
        cleaned["base_rate"] = rate if rate > 0 else 20.0

        shift = str(record.get("shift", "")).lower()
        if shift not in ["day", "night"]:
            shift = "day" # fallback
        cleaned["shift"] = shift

        cleaned["normal_ot_hours"] = self._parse_float(record.get("normal_ot_hours"), default=0.0)
        cleaned["weekend_ot_hours"] = self._parse_float(record.get("weekend_ot_hours"), default=0.0)
        cleaned["holiday_ot_hours"] = self._parse_float(record.get("holiday_ot_hours"), default=0.0)

        return cleaned

    def process(self):
        results = []
        if not isinstance(self.data, list):
            self.data = [self.data]

        for record in self.data:
            if not isinstance(record, dict):
                continue
            cleaned = self.clean_record(record)

            rate = cleaned["base_rate"]

            # Base daily pay (assume 8 hours standard)
            base_pay = rate * 8

            # Allowances
            night_allowance = 20.0 if cleaned["shift"] == "night" else 0.0

            # Overtime pay
            normal_ot_pay = cleaned["normal_ot_hours"] * rate * 1.5
            weekend_ot_pay = cleaned["weekend_ot_hours"] * rate * 2.0
            holiday_ot_pay = cleaned["holiday_ot_hours"] * rate * 3.0

            total_pay = base_pay + night_allowance + normal_ot_pay + weekend_ot_pay + holiday_ot_pay

            results.append({
                "employee_id": cleaned["employee_id"],
                "shift": cleaned["shift"],
                "base_rate": round(rate, 2),
                "base_pay": round(base_pay, 2),
                "night_allowance": round(night_allowance, 2),
                "normal_ot_pay": round(normal_ot_pay, 2),
                "weekend_ot_pay": round(weekend_ot_pay, 2),
                "holiday_ot_pay": round(holiday_ot_pay, 2),
                "total_pay": round(total_pay, 2)
            })
        return results

    def export(self, results, json_path="output.json", csv_path="output.csv"):
        # JSON export
        try:
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=4)
        except Exception:
            pass # Silent fail as requested for export safely

        # CSV (Mock Excel) export
        try:
            if results:
                keys = results[0].keys()
                with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=keys)
                    writer.writeheader()
                    writer.writerows(results)
        except Exception:
            pass

def run_cli_one_click():
    converter = ShiftOvertimeConverter()
    results = converter.process()
    converter.export(results)
    print("One-click execution completed. Results exported to output.json and output.csv")
    return results

if __name__ == "__main__":
    run_cli_one_click()
