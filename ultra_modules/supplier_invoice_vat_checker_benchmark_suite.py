import math
import time
import uuid
import random
from typing import List, Dict, Any

VALID_VAT_RATES = {0.06, 0.03, 0.01, 0.05}

class InvoiceVatChecker:
    @staticmethod
    def _clean_amount(val: Any) -> float:
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            if math.isnan(val) or math.isinf(val):
                return 0.0
            return max(0.0, float(val))
        if isinstance(val, str):
            try:
                # Remove common formatting like commas or currency symbols
                clean_str = val.replace(',', '').replace('￥', '').replace('$', '').strip()
                val_f = float(clean_str)
                if math.isnan(val_f) or math.isinf(val_f):
                    return 0.0
                return max(0.0, val_f)
            except ValueError:
                return 0.0
        return 0.0

    @staticmethod
    def _clean_rate(val: Any) -> float:
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            if math.isnan(val) or math.isinf(val):
                return 0.0
            val_f = float(val)
            if val_f > 1.0:
                val_f = val_f / 100.0
            return max(0.0, val_f)
        if isinstance(val, str):
            try:
                clean_str = val.replace('%', '').strip()
                val_f = float(clean_str)
                if '%' in val:
                    val_f = val_f / 100.0
                elif val_f > 1.0:
                    val_f = val_f / 100.0
                if math.isnan(val_f) or math.isinf(val_f):
                    return 0.0
                return max(0.0, val_f)
            except ValueError:
                return 0.0
        return 0.0

    @staticmethod
    def _clean_date(val: Any) -> str:
        if not isinstance(val, str):
            return "1970-01-01"
        return val.strip() if val.strip() else "1970-01-01"

    @staticmethod
    def check_invoice(invoice: Any) -> Dict[str, Any]:
        """
        Processes a single invoice dictionary safely.
        """
        if not isinstance(invoice, dict):
            invoice = {}

        amount = InvoiceVatChecker._clean_amount(invoice.get('amount'))
        tax_rate = InvoiceVatChecker._clean_rate(invoice.get('tax_rate'))
        invoice_date = InvoiceVatChecker._clean_date(invoice.get('date'))

        is_compliant = (tax_rate in VALID_VAT_RATES)

        if tax_rate >= 0:
            deduction_amount = (amount / (1.0 + tax_rate)) * tax_rate
        else:
            deduction_amount = 0.0
            is_compliant = False

        return {
            "invoice_id": str(invoice.get("invoice_id")) if invoice.get("invoice_id") else str(uuid.uuid4()),
            "original_amount": amount,
            "applied_tax_rate": tax_rate,
            "deduction_amount": round(deduction_amount, 2),
            "is_compliant": is_compliant,
            "invoice_date": invoice_date,
            "processed_at": time.time()
        }

    @staticmethod
    def process_batch(invoices: Any) -> List[Dict[str, Any]]:
        """
        Processes a batch of invoices safely.
        """
        if not isinstance(invoices, list):
            return []

        return [InvoiceVatChecker.check_invoice(inv) for inv in invoices]

class SyntheticFixtureGenerator:
    @staticmethod
    def generate_dataset(size: int = 10000) -> List[Dict[str, Any]]:
        dataset = []
        dirty_rates = [0.06, 0.03, 0.01, 0.05, 0.13, 0.0, None, "invalid_rate", "6%", 6, -0.01, float('inf'), float('nan')]
        dirty_amounts = [1000.0, 0.0, -500, None, "NaN", "1,000.50", "￥1000", float('inf'), float('nan'), 999999999999.99, "gibberish&*@#"]
        dirty_dates = ["2024-02-29", "2023-02-29", None, "invalid-date", "2023-13-45", "1999-12-31", 12345]

        for i in range(size):
            if random.random() < 0.7:
                dataset.append({
                    "invoice_id": f"INV-{i}",
                    "amount": random.uniform(100.0, 10000.0),
                    "tax_rate": random.choice([0.06, 0.03, 0.01, 0.05]),
                    "date": "2023-10-01"
                })
            else:
                dataset.append({
                    "invoice_id": f"DIRTY-INV-{i}" if random.random() > 0.1 else None,
                    "amount": random.choice(dirty_amounts),
                    "tax_rate": random.choice(dirty_rates),
                    "date": random.choice(dirty_dates)
                })
        return dataset

    @staticmethod
    def run_benchmark(size: int = 10000) -> Dict[str, Any]:
        dataset = SyntheticFixtureGenerator.generate_dataset(size)
        start_time = time.time()
        results = InvoiceVatChecker.process_batch(dataset)
        end_time = time.time()

        elapsed_ms = (end_time - start_time) * 1000
        return {
            "dataset_size": size,
            "elapsed_ms": elapsed_ms,
            "throughput_per_sec": size / (end_time - start_time) if end_time > start_time else float('inf'),
            "sample_results": results[:5]
        }

if __name__ == "__main__":
    benchmark_result = SyntheticFixtureGenerator.run_benchmark(50000)
    print(f"Processed {benchmark_result['dataset_size']} records in {benchmark_result['elapsed_ms']:.2f} ms.")
