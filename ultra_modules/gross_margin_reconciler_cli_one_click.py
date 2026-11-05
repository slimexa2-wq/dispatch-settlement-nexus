import json
import logging
from typing import Any, Dict, List

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


class GrossMarginReconciler:
    def __init__(self, data: List[Dict[str, Any]] = None):
        """
        Initializes the reconciler. Zero-config fault tolerance: missing data defaults to empty list.
        """
        self.data = data if data is not None else []

    def _clean_number(self, value: Any, default: float = 0.0) -> float:
        """
        Self-healing for dirty data: silently converts invalid numbers to a default value.
        """
        if value is None:
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default

    def reconcile(self) -> Dict[str, Any]:
        """
        Calculates net gross margin.
        Gross Margin = Revenue (Invoiced) - Payables (Same Pay + Rebate + Self-recruitment commission)
        """
        total_revenue = 0.0
        total_payables = 0.0
        details = []

        for row in self.data:
            # Dirty data self-healing and missing parameter default handling
            if not isinstance(row, dict):
                continue

            project = str(row.get("project", "Unknown Project"))
            revenue = self._clean_number(row.get("revenue"))
            base_pay = self._clean_number(row.get("base_pay"))
            rebate = self._clean_number(row.get("rebate"))
            commission = self._clean_number(row.get("commission"))

            payable = base_pay + rebate + commission
            margin = revenue - payable

            total_revenue += revenue
            total_payables += payable

            details.append({
                "project": project,
                "revenue": revenue,
                "payables": payable,
                "margin": margin,
            })

        total_margin = total_revenue - total_payables

        return {
            "summary": {
                "total_revenue": total_revenue,
                "total_payables": total_payables,
                "total_margin": total_margin,
            },
            "details": details,
        }

    def export_json(self) -> str:
        """
        Exports reconciliation result as JSON string.
        """
        result = self.reconcile()
        return json.dumps(result, indent=2, ensure_ascii=False)

    def export_excel(self) -> str:
        """
        Exports reconciliation result as a CSV string compatible with Excel.
        """
        import csv
        import io

        result = self.reconcile()
        output = io.StringIO()
        writer = csv.writer(output)

        # Write headers
        writer.writerow(["Project", "Revenue", "Payables", "Margin"])

        # Write details
        for row in result["details"]:
            writer.writerow([row["project"], row["revenue"], row["payables"], row["margin"]])

        # Write summary
        writer.writerow([])
        writer.writerow(["SUMMARY", "", "", ""])
        writer.writerow(["Total Revenue", "Total Payables", "Total Margin", ""])
        writer.writerow([
            result["summary"]["total_revenue"],
            result["summary"]["total_payables"],
            result["summary"]["total_margin"],
            ""
        ])

        return output.getvalue()


def run_cli_one_click():
    """
    Zero-parameter one-click CLI entry point. Provides default mock data if none is passed.
    """
    default_data = [
        {"project": "Project A", "revenue": 10000, "base_pay": 5000, "rebate": 1000, "commission": 500},
        {"project": "Project B", "revenue": 20000, "base_pay": 10000, "rebate": 2000, "commission": 1000},
    ]
    logging.info("Starting one-click reconciliation...")
    reconciler = GrossMarginReconciler(default_data)

    print("--- JSON Output ---")
    print(reconciler.export_json())

    print("--- Excel (CSV) Output ---")
    print(reconciler.export_excel())


if __name__ == "__main__":
    run_cli_one_click()
