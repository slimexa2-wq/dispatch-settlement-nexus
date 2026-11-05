import unittest
import datetime
import decimal
from ultra_modules.CrossMonthDuplicateGuard_integration_bridge import CrossMonthDuplicateGuard, FieldMapper

class TestCrossMonthDuplicateGuard(unittest.TestCase):
    def setUp(self):
        self.guard = CrossMonthDuplicateGuard()

    def test_normal_case_no_duplicate(self):
        # Claim with no history should be approved
        claim = {
            'workerId': 'W100',
            'projectId': 'P200',
            'claimDate': '2023-10-01',
            'amount': '150.50'
        }
        result = self.guard.process_claim(claim)

        self.assertEqual(result['status'], 'APPROVED')
        self.assertEqual(result['worker_id'], 'W100')
        self.assertEqual(result['project_id'], 'P200')
        self.assertEqual(result['amount'], decimal.Decimal('150.50'))

    def test_duplicate_intercepted_within_90_days(self):
        # Claim that has history within 90 days
        claim = {
            'employee_id': 'W101',
            'job_id': 'P201',
            'apply_date': '2023-10-15',
            'rebate': '200.00'
        }

        history = [
            {
                'uid': 'W101',
                'pid': 'P201',
                'timestamp': '2023-09-01', # 44 days ago
                'value': '200.00'
            }
        ]

        result = self.guard.process_claim(claim, history_records=history)

        self.assertEqual(result['status'], 'REJECTED')
        self.assertEqual(result['reason'], 'Duplicate claim within 90 days')
        self.assertEqual(result['amount'], decimal.Decimal('0.00'))

    def test_boundary_case_just_over_90_days(self):
        # Claim with history 91 days ago should be approved
        claim = {
            'id_card': 'W102',
            'project': 'P202',
            'date': '2023-10-15',
            'money': '300.00'
        }

        history = [
            {
                'user_id': 'W102',
                'proj_id': 'P202',
                'created_at': '2023-07-15', # 92 days ago
                'fee': '300.00'
            }
        ]

        result = self.guard.process_claim(claim, history_records=history)

        self.assertEqual(result['status'], 'APPROVED')
        self.assertEqual(result['amount'], decimal.Decimal('300.00'))

    def test_dirty_data_self_healing(self):
        # Claim with dirty data format (e.g. string instead of dict)
        # Should self-heal into an empty dict, extracting default values, and be approved
        claim = "Not a dict"
        result = self.guard.process_claim(claim) # type: ignore

        self.assertEqual(result['status'], 'APPROVED')
        self.assertEqual(result['worker_id'], 'UNKNOWN_WORKER')
        self.assertEqual(result['project_id'], 'UNKNOWN_PROJECT')
        self.assertEqual(result['amount'], decimal.Decimal('0.00'))

        logs = self.guard.get_audit_logs()
        self.assertTrue(any(log['action'] == 'ERROR' for log in logs))

    def test_missing_parameters_defaults(self):
        # Missing most parameters, should extract defaults gracefully
        claim = {
            'random_field': 'hello'
        }
        result = self.guard.process_claim(claim)

        self.assertEqual(result['status'], 'APPROVED')
        self.assertEqual(result['worker_id'], 'UNKNOWN_WORKER')
        self.assertEqual(result['project_id'], 'UNKNOWN_PROJECT')
        self.assertEqual(result['amount'], decimal.Decimal('0.00'))

    def test_dirty_history_records(self):
        claim = {
            'worker_id': 'W103',
            'project_id': 'P203',
            'date': '2023-11-01',
            'amount': 100
        }

        history = [
            "This is a bad record",
            None,
            123,
            {
                'worker_id': 'W103',
                'project_id': 'P203',
                'date': '2023-10-15',
                'amount': 100
            }
        ]

        result = self.guard.process_claim(claim, history_records=history)
        self.assertEqual(result['status'], 'REJECTED')

    def test_audit_logging_works(self):
        claim = {
            'worker_id': 'W104',
            'project_id': 'P204',
            'date': '2023-11-01',
            'amount': '150.00'
        }
        self.guard.process_claim(claim)

        logs = self.guard.get_audit_logs()
        self.assertTrue(len(logs) > 0)
        self.assertTrue(any(log['action'] == 'START_PROCESSING' for log in logs))
        self.assertTrue(any(log['action'] == 'MAPPED_FIELDS' for log in logs))
        self.assertTrue(any(log['action'] == 'CLAIM_APPROVED' for log in logs))
        self.assertTrue(any(log['action'] == 'END_PROCESSING' for log in logs))

if __name__ == '__main__':
    unittest.main()
