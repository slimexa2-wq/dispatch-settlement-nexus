import time
import random
from ultra_modules.penny_exact_reimbursement_core_engine import process_reimbursements

def generate_synthetic_fixtures(size=100):
    """
    Generates synthetic datasets for reimbursement testing.
    Includes normal data, dirty data, large numbers, duplicate invoices, and missing values.
    Missing parameter fallback to 100 size.
    """
    if size is None or size <= 0:
        size = 100

    fixtures = []
    # Seed for reproducibility in tests
    random.seed(42)

    for i in range(size):
        case_type = random.choice(['normal', 'dirty_amount', 'duplicate_invoice', 'missing_invoice', 'missing_amount', 'huge_amount', 'cross_year', 'cross_month'])

        record = {}
        if case_type == 'normal':
            record['invoice_no'] = f"INV_{i}"
            record['amount'] = f"{random.uniform(0.01, 10000.0):.2f}"
            record['date'] = f"2023-05-{random.randint(10, 28)}"
        elif case_type == 'cross_year':
            record['invoice_no'] = f"INV_{i}"
            record['amount'] = f"{random.uniform(0.01, 10000.0):.2f}"
            record['date'] = random.choice(["2023-12-31", "2024-01-01"])
        elif case_type == 'cross_month':
            record['invoice_no'] = f"INV_{i}"
            record['amount'] = f"{random.uniform(0.01, 10000.0):.2f}"
            record['date'] = random.choice(["2023-10-31", "2023-11-01"])
        elif case_type == 'dirty_amount':
            record['invoice_no'] = f"INV_{i}"
            # Add currency symbols, spaces, commas
            record['amount'] = f"¥ {random.randint(1, 1000)},{random.randint(10, 99)}. {random.choice([0, 5])}"
            record['date'] = "2023-05-15"
        elif case_type == 'duplicate_invoice':
            record['invoice_no'] = "INV_DUPLICATE_123"
            record['amount'] = "100.00"
            record['date'] = "2023-05-15"
        elif case_type == 'missing_invoice':
            # missing invoice_no
            record['amount'] = "50.00"
            record['date'] = "2023-05-15"
        elif case_type == 'missing_amount':
            record['invoice_no'] = f"INV_{i}"
            # missing amount
            record['date'] = "2023-05-15"
        elif case_type == 'huge_amount':
            record['invoice_no'] = f"INV_{i}"
            record['amount'] = "999999999.99"
            record['date'] = "2023-05-15"

        fixtures.append(record)

    # Also add an explicitly empty dict and non-dict for extreme edge case
    fixtures.append({})
    fixtures.append("not a dictionary")

    return fixtures

def run_benchmark(size=10000):
    """
    Runs a benchmark on the process_reimbursements function.
    Verifies millisecond-level responsiveness.
    """
    if size is None or size <= 0:
        size = 10000

    fixtures = generate_synthetic_fixtures(size)

    start_time = time.time()
    result = process_reimbursements(fixtures)
    end_time = time.time()

    processing_time_ms = (end_time - start_time) * 1000

    return {
        "processing_time_ms": processing_time_ms,
        "processed_count": len(result['processed_records']),
        "total_cents": result['total_cents']
    }

def verify_precision_and_duplicates(fixtures=None):
    """
    Verifies that the core engine correctly deduplicates invoices
    and calculates total cents accurately without crashing.
    """
    if fixtures is None:
        fixtures = generate_synthetic_fixtures(100)

    result = process_reimbursements(fixtures)

    processed_records = result.get('processed_records', [])
    total_cents = result.get('total_cents', 0)

    seen_invoices = set()
    duplicates_found = False

    sum_cents = 0

    for record in processed_records:
        invoice = record.get('invoice_no')
        if invoice:
            if invoice in seen_invoices:
                duplicates_found = True
            seen_invoices.add(invoice)

        sum_cents += record.get('cents', 0)

    precision_matches = (sum_cents == total_cents)

    return {
        "no_duplicates": not duplicates_found,
        "precision_matches": precision_matches,
        "total_cents": total_cents
    }
