import unittest
import decimal
import time
from ultra_modules.gross_margin_reconciler_self_healing_guard import GrossMarginReconciler

class TestGrossMarginReconciler(unittest.TestCase):
    def setUp(self):
        self.reconciler = GrossMarginReconciler()

    def test_normal_case(self):
        result = self.reconciler.calculate_gross_margin(
            revenue='1000.50',
            regular_pay='500.00',
            bonus_pay='100.25',
            self_recruitment_commission='50.00'
        )
        self.assertEqual(result['revenue'], decimal.Decimal('1000.50'))
        self.assertEqual(result['gross_margin'], decimal.Decimal('350.25'))

    def test_dirty_data_self_healing(self):
        result = self.reconciler.calculate_gross_margin(
            revenue='￥1,000.50',
            regular_pay='approx 500.00 dollars',
            bonus_pay='  100.25  ',
            self_recruitment_commission='NaN'
        )
        self.assertEqual(result['revenue'], decimal.Decimal('1000.50'))
        self.assertEqual(result['regular_pay'], decimal.Decimal('500.00'))
        self.assertEqual(result['bonus_pay'], decimal.Decimal('100.25'))
        self.assertEqual(result['self_recruitment_commission'], decimal.Decimal('0.00'))
        self.assertEqual(result['gross_margin'], decimal.Decimal('400.25'))

    def test_missing_parameters_fallback(self):
        # Missing regular_pay, bonus_pay, self_recruitment_commission
        result = self.reconciler.calculate_gross_margin(revenue=1000)
        self.assertEqual(result['revenue'], decimal.Decimal('1000.00'))
        self.assertEqual(result['regular_pay'], decimal.Decimal('0.00'))
        self.assertEqual(result['gross_margin'], decimal.Decimal('1000.00'))

    def test_undo_within_5_seconds(self):
        res1 = self.reconciler.calculate_gross_margin(revenue=100)
        res2 = self.reconciler.calculate_gross_margin(revenue=200)

        undone = self.reconciler.undo()
        self.assertIsNotNone(undone)
        self.assertEqual(undone['revenue'], decimal.Decimal('200.00'))

        undone_again = self.reconciler.undo()
        self.assertIsNotNone(undone_again)
        self.assertEqual(undone_again['revenue'], decimal.Decimal('100.00'))

        self.assertIsNone(self.reconciler.undo())

    def test_undo_boundary_expired(self):
        self.reconciler.calculate_gross_margin(revenue=100)

        # Modify the timestamp to simulate expiration
        self.reconciler._history[0]['timestamp'] = time.time() - 6.0

        undone = self.reconciler.undo()
        self.assertIsNone(undone)

if __name__ == '__main__':
    unittest.main()
