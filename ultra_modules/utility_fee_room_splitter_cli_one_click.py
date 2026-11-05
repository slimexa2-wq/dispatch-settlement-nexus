import json
import logging
from typing import Any, Dict, List, Optional

# Basic logging config
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

class UtilityFeeRoomSplitter:
    def __init__(self, total_fee: Any = 0, occupants: Optional[List[Dict[str, Any]]] = None):
        self.total_fee = self._clean_number(total_fee)
        self.occupants = self._clean_occupants(occupants)

    def _clean_number(self, value: Any, default: float = 0.0) -> float:
        if value is None:
            return default
        try:
            val = float(value)
            return val if val >= 0 else default
        except (ValueError, TypeError):
            return default

    def _clean_days(self, value: Any, default: int = 0) -> int:
        if value is None:
            return default
        try:
            val = int(float(value))
            return val if val >= 0 else default
        except (ValueError, TypeError):
            return default

    def _clean_occupants(self, occupants: Any) -> List[Dict[str, Any]]:
        if not isinstance(occupants, list):
            return []

        cleaned = []
        for occ in occupants:
            if not isinstance(occ, dict):
                continue
            name = str(occ.get("name", "Unknown"))
            if not name.strip():
                name = "Unknown"

            days_stayed = self._clean_days(occ.get("days_stayed", 0))
            cleaned.append({
                "name": name,
                "days_stayed": days_stayed
            })
        return cleaned

    def calculate_split(self) -> Dict[str, Any]:
        """
        Calculate the utility fee split based on days stayed.
        Returns a dictionary with the results.
        """
        if not self.occupants:
            return {
                "total_fee": self.total_fee,
                "status": "error",
                "message": "No valid occupants provided.",
                "splits": []
            }

        total_days = sum(occ["days_stayed"] for occ in self.occupants)

        splits = []

        if total_days == 0:
            # If total days is 0, but there's a fee, split equally among occupants
            if self.total_fee > 0:
                equal_share = round(self.total_fee / len(self.occupants), 2)
                # Adjust for rounding errors
                total_allocated = 0.0
                for i, occ in enumerate(self.occupants):
                    if i == len(self.occupants) - 1:
                        amount = round(self.total_fee - total_allocated, 2)
                    else:
                        amount = equal_share

                    total_allocated += amount
                    splits.append({
                        "name": occ["name"],
                        "days_stayed": 0,
                        "amount": amount
                    })
            else:
                for occ in self.occupants:
                    splits.append({
                        "name": occ["name"],
                        "days_stayed": 0,
                        "amount": 0.0
                    })
        else:
            total_allocated = 0.0
            for i, occ in enumerate(self.occupants):
                if i == len(self.occupants) - 1:
                    amount = round(self.total_fee - total_allocated, 2)
                else:
                    share = occ["days_stayed"] / total_days
                    amount = round(self.total_fee * share, 2)

                total_allocated += amount
                splits.append({
                    "name": occ["name"],
                    "days_stayed": occ["days_stayed"],
                    "amount": max(0.0, amount) # Ensure no negative due to weird floating point rounding
                })

        return {
            "total_fee": self.total_fee,
            "status": "success",
            "message": "Fees calculated successfully.",
            "splits": splits
        }

import csv
import sys

def run_cli():
    # Check if --excel flag is passed, or just output both
    export_excel = "--excel" in sys.argv

    # Zero-parameter fallback/mock data
    default_total_fee = 150.50
    default_occupants = [
        {"name": "Alice", "days_stayed": 30},
        {"name": "Bob", "days_stayed": 15},
        {"name": "Charlie", "days_stayed": "dirty_data_healed_to_0"}
    ]

    splitter = UtilityFeeRoomSplitter(default_total_fee, default_occupants)
    result = splitter.calculate_split()

    if export_excel:
        # Excel/CSV mode
        filename = "utility_fee_split_result.csv"
        try:
            with open(filename, mode='w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f)
                writer.writerow(["Name", "Days Stayed", "Amount Due"])
                for split in result.get("splits", []):
                    writer.writerow([split["name"], split["days_stayed"], split["amount"]])
            print(f"Excel/CSV report successfully generated: {filename}")
        except Exception as e:
            print(f"Error generating Excel report: {e}")
    else:
        # JSON mode
        print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    run_cli()
