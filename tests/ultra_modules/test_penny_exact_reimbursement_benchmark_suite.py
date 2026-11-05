import unittest
from ultra_modules.penny_exact_reimbursement_benchmark_suite import (
    generate_synthetic_fixtures,
    run_benchmark,
    verify_precision_and_duplicates
)
from ultra_modules.penny_exact_reimbursement_core_engine import process_reimbursements

class TestPennyExactReimbursementBenchmarkSuite(unittest.TestCase):

    def test_generate_synthetic_fixtures_normal_and_dirty_data(self):
        # Generates normal and dirty data and extreme values
        fixtures = generate_synthetic_fixtures(100)
        self.assertGreater(len(fixtures), 100) # Includes the 2 explicit edge cases
        self.assertEqual(len(fixtures), 102)

        # Process the fixtures and verify no crash
        result = process_reimbursements(fixtures)
        self.assertIn('total_cents', result)
        self.assertIn('processed_records', result)
        self.assertIsInstance(result['total_cents'], int)

    def test_generate_synthetic_fixtures_missing_param_fallback(self):
        # Missing parameter should fallback to size=100
        fixtures_none = generate_synthetic_fixtures(None)
        fixtures_zero = generate_synthetic_fixtures(0)
        self.assertEqual(len(fixtures_none), 102)
        self.assertEqual(len(fixtures_zero), 102)

    def test_verify_precision_and_duplicates_custom_fixtures(self):
        # Custom fixtures to explicitly test duplicate invoice and precision
        fixtures = [
            {"invoice_no": "INV_1", "amount": "10.00"},
            {"invoice_no": "INV_2", "amount": "20.50"},
            {"invoice_no": "INV_1", "amount": "30.00"}, # Duplicate invoice
            {"invoice_no": "INV_3", "amount": "100.99"},
        ]

        result = verify_precision_and_duplicates(fixtures)
        self.assertTrue(result['no_duplicates'])
        self.assertTrue(result['precision_matches'])

        # total_cents = (10.00 + 20.50 + 100.99) * 100 = 1000 + 2050 + 10099 = 13149
        self.assertEqual(result['total_cents'], 13149)

    def test_verify_precision_and_duplicates_default_fixtures(self):
        # Verify precision with the default synthetic data (which includes duplicates, dirt, etc.)
        result = verify_precision_and_duplicates(None)
        self.assertTrue(result['no_duplicates'])
        self.assertTrue(result['precision_matches'])

    def test_run_benchmark_performance_and_no_crash(self):
        # Run benchmark with a reasonable size to check speed (millisecond responsiveness)
        benchmark_result = run_benchmark(2000)
        self.assertIn('processing_time_ms', benchmark_result)
        self.assertIn('processed_count', benchmark_result)
        self.assertIn('total_cents', benchmark_result)

        # Check processing time is returned and is somewhat responsive
        # (usually sub-1000ms for 2000 records, but we just check it exists and is > 0)
        self.assertGreater(benchmark_result['processing_time_ms'], 0)

    def test_extreme_boundaries(self):
        # Huge amounts and extreme boundaries
        fixtures = [
            {"invoice_no": "INV_HUGE1", "amount": "999999999.99"},
            {"invoice_no": "INV_HUGE2", "amount": "1234567890.12"},
            {"invoice_no": "INV_DIRTY", "amount": "¥ 1,234,567,890.12 "},
            {"invoice_no": "INV_EMPTY", "amount": ""},
            {"invoice_no": "INV_NULL", "amount": None}
        ]
        result = process_reimbursements(fixtures)

        total = result['total_cents']
        # 99999999999 + 123456789012 + 123456789012 = 346913578023
        self.assertEqual(total, 346913578023)

if __name__ == '__main__':
    unittest.main()